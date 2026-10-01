//============================================================================================================================================
//                                                            TREADMESHSOLVER.CPP
//============================================================================================================================================
// 📦 Grid-clipped floors, extruded groove walls, and the mapping from the unrolled domain onto the carcass.

#include "TreadMeshSolver.h"
#include "TyreProfileSpecification.h"

#include "clipper2/clipper.h"
#include "clipper2/clipper.triangulation.h"

#include <algorithm>
#include <cmath>

namespace Frontier {

using Clipper2Lib::Path64;
using Clipper2Lib::Paths64;
using Clipper2Lib::Point64;
using Clipper2Lib::FillRule;

namespace {

constexpr double ClipperScale = 1000.0;                // [-]  - must match TreadRegionSolver
constexpr float  π            = 3.14159265358979323846f;

//------------------------------------------------------------------------------------------------------------------------
//                                                   DOMAIN TO CARCASS
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Places one point of the unrolled tread onto the moulded carcass at a given depth.
/// note  📐 The depth is scaled by the profile's contact weight, so a groove fades out as the shoulder
///       turns away. Cutting a groove at full depth where the surface is nearly parallel to the axis would
///       drive the floor through the sidewall.
struct PlacedPoint
{
    float X, Y, Z;      // [mm]  - carcass position
    float Nx, Ny, Nz;   // [-]   - outward normal of the moulded surface at that point
};

[[nodiscard]] PlacedPoint Place(double                    Circumferential,
                                double                    Lateral,
                                double                    Depth,
                                const TreadDerivedValues& Derived,
                                const TreadSpecification& Specification) noexcept
{
    const TyreProfileSample Sample = EvaluateTyreProfile(static_cast<float>(Lateral),
                                                         Specification, Derived);
    const double Sink  = Depth * static_cast<double>(Sample.ContactWeight);
    const double Axial = Sample.Lateral - Sample.NormalLateral * Sink;
    const double Reach = Sample.Radius  - Sample.NormalRadial  * Sink;
    const double θ     = Circumferential / Derived.Circumference * 2.0 * π;

    PlacedPoint Result;
    Result.X  = static_cast<float>(Axial);
    Result.Y  = static_cast<float>(Reach * std::cos(θ));
    Result.Z  = static_cast<float>(Reach * std::sin(θ));
    Result.Nx = Sample.NormalLateral;
    Result.Ny = static_cast<float>(Sample.NormalRadial * std::cos(θ));
    Result.Nz = static_cast<float>(Sample.NormalRadial * std::sin(θ));
    return Result;
}

[[nodiscard]] TyreCornerRecord Corner(const PlacedPoint&        Point,
                                      double                    Circumferential,
                                      double                    Lateral,
                                      const TreadDerivedValues& Derived) noexcept
{
    TyreCornerRecord Record;
    Record.NormalX = Point.Nx;
    Record.NormalY = Point.Ny;
    Record.NormalZ = Point.Nz;
    Record.U       = static_cast<float>(Circumferential / Derived.Circumference);
    Record.V       = static_cast<float>((Lateral + Derived.AcrossHalf) / (2.0 * Derived.AcrossHalf));
    return Record;
}

/// 📦 Welds a domain point at a depth and returns its index together with its shading corner.
struct WeldedPoint
{
    uint32_t         Index = 0u;
    TyreCornerRecord Attribute;
};

[[nodiscard]] WeldedPoint Weld(double                    Circumferential,
                               double                    Lateral,
                               double                    Depth,
                               const TreadDerivedValues& Derived,
                               const TreadSpecification& Specification,
                               TyreMeshStructure&        Mesh) noexcept
{
    const PlacedPoint Point = Place(Circumferential, Lateral, Depth, Derived, Specification);
    WeldedPoint Result;
    Result.Index     = Mesh.WeldPosition(Point.X, Point.Y, Point.Z);
    Result.Attribute = Corner(Point, Circumferential, Lateral, Derived);
    return Result;
}

//------------------------------------------------------------------------------------------------------------------------
//                                                          GRID
//------------------------------------------------------------------------------------------------------------------------

/// 📦 Lateral grid lines, refined where the shoulder arc starts to turn.
/// note  💡 A uniform lateral pitch wastes vertices on the flat crown and still under-resolves the
///       shoulder, where the surface is curving hardest and the silhouette is decided.
[[nodiscard]] std::vector<double> LateralLines(const TreadDerivedValues& Derived,
                                               const TreadMeshSettings&  Settings) noexcept
{
    std::vector<double> Lines;
    const double Across    = Derived.AcrossHalf;
    const double TreadHalf = Derived.TreadHalf;
    const double Coarse    = std::max(0.25, static_cast<double>(Settings.CellLateral));
    const double Fine      = std::max(0.25, static_cast<double>(Settings.ShoulderLateral));

    const int CrownSteps = std::max(1, static_cast<int>(std::ceil(2.0 * TreadHalf / Coarse)));
    for (int Step = 0; Step <= CrownSteps; ++Step)
        Lines.push_back(-TreadHalf + 2.0 * TreadHalf * Step / CrownSteps);

    const double Shoulder = Across - TreadHalf;
    const int    Steps    = std::max(1, static_cast<int>(std::ceil(Shoulder / Fine)));
    for (int Step = 1; Step <= Steps; ++Step)
    {
        const double Offset = Shoulder * Step / Steps;
        Lines.push_back(TreadHalf + Offset);
        Lines.push_back(-TreadHalf - Offset);
    }

    std::sort(Lines.begin(), Lines.end());
    Lines.erase(std::unique(Lines.begin(), Lines.end(),
                            [](double L, double R) { return std::fabs(L - R) < 1.0e-4; }),
                Lines.end());
    return Lines;
}

[[nodiscard]] int64_t Unit(double Millimetres) noexcept
{
    return static_cast<int64_t>(std::llround(Millimetres * ClipperScale));
}

[[nodiscard]] Path64 CellPath(double X0, double Y0, double X1, double Y1) noexcept
{
    return Path64{ Point64(Unit(X0), Unit(Y0)), Point64(Unit(X1), Unit(Y0)),
                   Point64(Unit(X1), Unit(Y1)), Point64(Unit(X0), Unit(Y1)) };
}

[[nodiscard]] Paths64 ToPaths(const std::vector<TreadContour>& Contours) noexcept
{
    Paths64 Result;
    Result.reserve(Contours.size());
    for (const TreadContour& Contour : Contours)
    {
        Path64 Single;
        Single.reserve(Contour.Points.size());
        for (const TreadContourPoint& Point : Contour.Points)
            Single.push_back(Point64(Unit(Point.Circumferential), Unit(Point.Lateral)));
        Result.push_back(std::move(Single));
    }
    return Result;
}

/// 📦 Inserts a vertex wherever a contour crosses a grid line.
/// note  💡 This is what closes the mesh. The floors are produced by clipping against the grid, so their
///       boundary already carries a vertex at every grid crossing. A wall extruded from the raw contour
///       would span those crossings in one edge and leave a T-junction at each — the floor side split,
///       the wall side not — and every one of them reads as a crack. Both sides must see the same points.
[[nodiscard]] std::vector<TreadContourPoint> SubdivideByGrid(const std::vector<TreadContourPoint>& Points,
                                                             double                     Circumference,
                                                             int                        Columns,
                                                             const std::vector<double>& Lateral) noexcept
{
    std::vector<TreadContourPoint> Result;
    const size_t Count = Points.size();
    Result.reserve(Count * 2u);

    for (size_t Step = 0; Step < Count; ++Step)
    {
        const TreadContourPoint& From = Points[Step];
        const TreadContourPoint& To   = Points[(Step + 1u) % Count];
        Result.push_back(From);

        const double Dx = static_cast<double>(To.Circumferential) - From.Circumferential;
        const double Dy = static_cast<double>(To.Lateral)         - From.Lateral;
        std::vector<double> Crossings;

        if (std::fabs(Dx) > 1.0e-9)
        {
            const double Pitch = Circumference / Columns;
            const double Low   = std::min(From.Circumferential, To.Circumferential);
            const double High  = std::max(From.Circumferential, To.Circumferential);
            for (int Line = static_cast<int>(std::floor(Low / Pitch)) + 1;
                 Line * Pitch < High; ++Line)
            {
                const double Fraction = (Line * Pitch - From.Circumferential) / Dx;
                if (Fraction > 1.0e-9 && Fraction < 1.0 - 1.0e-9)
                    Crossings.push_back(Fraction);
            }
        }

        if (std::fabs(Dy) > 1.0e-9)
        {
            for (const double Line : Lateral)
            {
                const double Fraction = (Line - From.Lateral) / Dy;
                if (Fraction > 1.0e-9 && Fraction < 1.0 - 1.0e-9)
                    Crossings.push_back(Fraction);
            }
        }

        std::sort(Crossings.begin(), Crossings.end());
        for (const double Fraction : Crossings)
        {
            Result.push_back(TreadContourPoint{
                static_cast<float>(From.Circumferential + Dx * Fraction),
                static_cast<float>(From.Lateral + Dy * Fraction) });
        }
    }
    return Result;
}

}   // namespace

//------------------------------------------------------------------------------------------------------------------------
//                                                       MESH SOLVE
//------------------------------------------------------------------------------------------------------------------------

TreadMeshMetrics SolveTreadMesh(const TreadRegionResult&  Regions,
                                const TreadSpecification& Specification,
                                const TreadDerivedValues& Derived,
                                const TreadMeshSettings&  Settings,
                                TyreMeshStructure&        Mesh) noexcept
{
    TreadMeshMetrics Metrics;
    Mesh.Clear();

    const double Circumference = Derived.Circumference;
    const std::vector<double> Lateral = LateralLines(Derived, Settings);
    const double Pitch   = std::max(0.25, static_cast<double>(Settings.CellCircumferential));
    const int    Columns = std::max(1, static_cast<int>(std::llround(Circumference / Pitch)));

    // 📝 ① Floors. Each piece is clipped against the grid in three levels — row, block, cell — because
    //    clipping ten thousand cells against six hundred contours directly is quadratic and this is not.
    //    Each level narrows the geometry the next one has to consider.
    constexpr int BlockWidth = 16;

    for (const TreadFloorPiece& Piece : Regions.Pieces)
    {
        const Paths64 PiecePaths = ToPaths(Piece.Contours);
        if (PiecePaths.empty())
            continue;

        const double Depth = static_cast<double>(Piece.Depth);

        for (size_t Row = 0; Row + 1u < Lateral.size(); ++Row)
        {
            const double Y0 = Lateral[Row];
            const double Y1 = Lateral[Row + 1u];
            const Paths64 RowPaths = Clipper2Lib::Intersect(
                PiecePaths, Paths64{ CellPath(0.0, Y0, Circumference, Y1) }, FillRule::NonZero);
            if (RowPaths.empty())
                continue;

            for (int Block = 0; Block < Columns; Block += BlockWidth)
            {
                const int    Last = std::min(Columns, Block + BlockWidth);
                const double Bx0  = Circumference * Block / Columns;
                const double Bx1  = Circumference * Last  / Columns;
                const Paths64 BlockPaths = Clipper2Lib::Intersect(
                    RowPaths, Paths64{ CellPath(Bx0, Y0, Bx1, Y1) }, FillRule::NonZero);
                if (BlockPaths.empty())
                    continue;

                for (int Column = Block; Column < Last; ++Column)
                {
                    const double X0 = Circumference * Column / Columns;
                    const double X1 = Circumference * (Column + 1) / Columns;
                    const Path64 Cell = CellPath(X0, Y0, X1, Y1);
                    const Paths64 Clipped = Clipper2Lib::Intersect(BlockPaths, Paths64{ Cell },
                                                                   FillRule::NonZero);
                    if (Clipped.empty())
                        continue;

                    // 📝 ② A cell the outline never touched comes back as the cell itself, and that is the
                    //    common case away from a groove. It is emitted as one quad. Only a cell a groove
                    //    edge actually cut needs triangulating, so triangles appear exactly at the edges.
                    const bool Whole = Clipped.size() == 1u && Clipped.front().size() == 4u
                                     && std::fabs(std::fabs(Clipper2Lib::Area(Clipped.front()))
                                                  - std::fabs(Clipper2Lib::Area(Cell))) < 1.0;

                    if (Whole)
                    {
                        std::vector<WeldedPoint> Ring;
                        Ring.reserve(4u);
                        for (const Point64& Vertex : Clipped.front())
                        {
                            Ring.push_back(Weld(static_cast<double>(Vertex.x) / ClipperScale,
                                                static_cast<double>(Vertex.y) / ClipperScale,
                                                Depth, Derived, Specification, Mesh));
                        }
                        Mesh.AddQuad(Ring[0].Index, Ring[1].Index, Ring[2].Index, Ring[3].Index,
                                     Ring[0].Attribute, Ring[1].Attribute,
                                     Ring[2].Attribute, Ring[3].Attribute);
                        ++Metrics.FloorQuad;
                        continue;
                    }

                    // 📝 ③ A cut cell is triangulated as a whole, holes and all. Fanning each returned loop
                    //    separately would fill the holes in: Clipper returns an inner loop as its own path,
                    //    and a fan over it is a solid patch where there should be a groove.
                    Paths64 Triangles;
                    if (Clipper2Lib::Triangulate(Clipped, Triangles) != Clipper2Lib::TriangulateResult::success)
                        continue;

                    for (const Path64& Facet : Triangles)
                    {
                        if (Facet.size() != 3u)
                            continue;
                        if (std::fabs(Clipper2Lib::Area(Facet)) < ClipperScale * ClipperScale * 1.0e-3)
                            continue;

                        std::vector<WeldedPoint> Ring;
                        Ring.reserve(3u);
                        for (const Point64& Vertex : Facet)
                        {
                            Ring.push_back(Weld(static_cast<double>(Vertex.x) / ClipperScale,
                                                static_cast<double>(Vertex.y) / ClipperScale,
                                                Depth, Derived, Specification, Mesh));
                        }
                        Mesh.AddTriangle(Ring[0].Index, Ring[1].Index, Ring[2].Index,
                                         Ring[0].Attribute, Ring[1].Attribute, Ring[2].Attribute);
                        ++Metrics.FloorTriangle;
                    }
                }
            }
        }
    }

    // 📝 ③ Walls. Every piece deeper than the crown is bounded by the outline it was cut along, and the
    //    rubber between that floor and the floor above is a vertical face. Extruding each outline edge
    //    gives exactly one quad, so the walls are pure quads and need no triangulation at all.
    for (size_t Index = 1u; Index < Regions.Pieces.size(); ++Index)
    {
        const TreadFloorPiece& Piece = Regions.Pieces[Index];
        const double Lower = static_cast<double>(Piece.Depth);
        const double Upper = static_cast<double>(Regions.Pieces[Index - 1u].Depth);
        if (Lower <= Upper)
            continue;

        for (const TreadContour& Contour : Piece.Contours)
        {
            if (Contour.Points.size() < 3u)
                continue;

            // 📝 ⚠️ Only the outer contours of a piece border the floor above it. A hole in this piece is
            //    the outline of a deeper piece sitting inside it, and the wall there runs from this floor
            //    down to that one — which the deeper piece raises from its own outer contour. Extruding it
            //    here as well gave the same outline two different walls, three faces on one edge, and the
            //    non-manifold count that exposed it.
            if (Contour.Hole)
                continue;

            const std::vector<TreadContourPoint> Dense =
                SubdivideByGrid(Contour.Points, Circumference, Columns, Lateral);
            const size_t Count = Dense.size();

            for (size_t Step = 0; Step < Count; ++Step)
            {
                const TreadContourPoint& From = Dense[Step];
                const TreadContourPoint& To   = Dense[(Step + 1u) % Count];

                const WeldedPoint TopFrom = Weld(From.Circumferential, From.Lateral, Upper,
                                                 Derived, Specification, Mesh);
                const WeldedPoint TopTo   = Weld(To.Circumferential,   To.Lateral,   Upper,
                                                 Derived, Specification, Mesh);
                const WeldedPoint LowFrom = Weld(From.Circumferential, From.Lateral, Lower,
                                                 Derived, Specification, Mesh);
                const WeldedPoint LowTo   = Weld(To.Circumferential,   To.Lateral,   Lower,
                                                 Derived, Specification, Mesh);

                if (TopFrom.Index == TopTo.Index || LowFrom.Index == LowTo.Index)
                    continue;

                Mesh.AddQuad(TopFrom.Index, TopTo.Index, LowTo.Index, LowFrom.Index,
                             TopFrom.Attribute, TopTo.Attribute, LowTo.Attribute, LowFrom.Attribute);
                ++Metrics.WallQuad;
            }
        }
    }

    const double Faces = static_cast<double>(Metrics.FloorQuad + Metrics.WallQuad
                                             + Metrics.FloorTriangle);
    Metrics.QuadFraction = Faces > 0.0
                         ? static_cast<double>(Metrics.FloorQuad + Metrics.WallQuad) / Faces
                         : 0.0;
    return Metrics;
}

}   // namespace Frontier
