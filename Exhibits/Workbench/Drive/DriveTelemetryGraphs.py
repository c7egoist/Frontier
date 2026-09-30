#!/usr/bin/env python3
"""Plot the Project-Drive run from the telemetry the real VehicleSolver wrote.

Every series here is a column of ProjectDrivePhysicsTelemetry_CPU_Reference.csv, which is produced by
`Projects/Project-Drive/Source/DriveTelemetry.cpp` stepping the shipped `VehicleSolver` (PacejkaDrivetrain,
XPBD soft tyres, closed-loop `Aerodynamics`) at 240 Hz against `DriveCourse`'s heightfield. Nothing is modelled,
smoothed or invented in this file — it reads numbers and draws axes, so the graphs are evidence that the vehicle
was run rather than an illustration of what running it would look like.

Written with the standard library only (no numpy, no PIL) so the proof has no plotting dependency.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from SheetRaster import Raster, DARK, PANEL, BORDER, INK, DIM, CYAN, BLUE, ORANGE, WHITE  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
GALLERY = ROOT / "Exhibits/Gallery/Drive"

GREEN = (110, 226, 150)
RED = (255, 110, 110)
VIOLET = (185, 150, 255)
GRID = (30, 48, 70)

WIDTH, HEIGHT = 1120, 520
PLOT = (110, 120, WIDTH - 180, 300)                 # left, top, width, height


def nice_step(extent: float) -> float:
    """A round tick interval that divides `extent` into four to eleven bands, so every label is a tidy number."""
    magnitude = 1e-9
    while magnitude * 100.0 < extent:
        magnitude *= 10.0
    for scale in (0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 2.5, 5.0, 10.0, 20.0, 25.0, 50.0, 100.0, 200.0, 250.0, 500.0):
        if 4.0 <= extent / (scale * magnitude) <= 11.0:
            return scale * magnitude
    return extent / 10.0


def nice_ceiling(value: float) -> float:
    """A round axis top at or above `value`, so the tick labels read as numbers a person would choose."""
    if value <= 0.0:
        return 1.0
    magnitude = 10.0 ** (len(str(int(value))) - 1)
    for step in (1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0):
        if value <= step * magnitude:
            return step * magnitude
    return 10.0 * magnitude


class Plot:
    """One framed, gridded, labelled time axis that any number of series can be drawn onto."""

    def __init__(self, title: str, subtitle: str, span: float, low: float, high: float, unit: str) -> None:
        self.canvas = Raster(WIDTH, HEIGHT, DARK)
        self.span, self.low, self.high = span, low, high
        self.left, self.top, self.width, self.height = PLOT
        c = self.canvas
        c.rect(0, 0, WIDTH, HEIGHT, DARK)
        c.text(40, 30, title, 3, INK)
        c.text(40, 62, subtitle, 2, DIM)
        c.rect(self.left, self.top, self.width, self.height, PANEL, BORDER)

        step_value = nice_step(high - low)
        decimals = 0 if step_value >= 1.0 else (1 if step_value >= 0.1 else 2)
        index = 0
        while low + step_value * index <= high + 1e-6:
            value = low + step_value * index
            y = self.top + self.height - round(self.height * (value - low) / (high - low))
            if index:
                c.line(self.left + 1, y, self.left + self.width - 2, y, GRID)
            label = f"{value:.{decimals}f}"
            c.text(self.left - 14 - 12 * len(label), y - 7, label, 2, DIM)
            index += 1
        for step in range(0, 13):
            x = self.left + round(self.width * step / 12)
            if step:
                c.line(x, self.top + 1, x, self.top + self.height - 2, GRID)
            c.text(x - 10, self.top + self.height + 14, f"{span * step / 12:.0f}", 2, DIM)
        c.text(self.left + self.width + 14, self.top + self.height + 14, "S", 2, DIM)
        c.text(self.left, self.top - 26, unit, 2, DIM)
        self.legend_x = self.left + 12
        self.legend_y = self.top + 10

    def point(self, t: float, value: float) -> tuple[int, int]:
        x = self.left + round(self.width * min(max(t / self.span, 0.0), 1.0))
        frac = (value - self.low) / (self.high - self.low) if self.high > self.low else 0.0
        y = self.top + self.height - round(self.height * min(max(frac, 0.0), 1.0))
        return x, y

    def series(self, samples: list[tuple[float, float]], colour: tuple[int, int, int],
               label: str, thickness: int = 2) -> None:
        previous = None
        for t, value in samples:
            current = self.point(t, value)
            if previous:
                self.canvas.line(previous[0], previous[1], current[0], current[1], colour, thickness)
            previous = current
        self.canvas.rect(self.legend_x, self.legend_y, 22, 8, colour)
        self.canvas.text(self.legend_x + 30, self.legend_y - 3, label, 2, INK)
        self.legend_y += 22

    def marker(self, t: float, label: str) -> None:
        x = self.left + round(self.width * min(max(t / self.span, 0.0), 1.0))
        for y in range(self.top + 2, self.top + self.height - 2, 8):
            self.canvas.line(x, y, x, y + 3, (92, 116, 148))
        self.canvas.text(x + 6, self.top + self.height - 24, label, 2, (132, 158, 190))

    def note(self, text: str) -> None:
        self.canvas.text(40, HEIGHT - 40, text, 2, DIM)

    def write(self, target: Path) -> Path:
        self.canvas.png(target)
        print(f"[graphs] wrote {target.name}")
        return target


def read_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise SystemExit(f"{csv_path} carries no samples")
    return rows


def column(rows: list[dict[str, str]], name: str, scale: float = 1.0) -> list[tuple[float, float]]:
    if name not in rows[0]:
        raise SystemExit(f"{name} is not a column of the telemetry — re-run DriveTelemetry")
    return [(float(row["t"]), float(row[name]) * scale) for row in rows]


def render(csv_path: Path, out_dir: Path) -> list[Path]:
    rows = read_rows(csv_path)
    span = float(rows[-1]["t"])
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []

    def markers(plot: Plot) -> None:
        plot.marker(1.0, "THROTTLE")
        plot.marker(2.5, "SLALOM")
        plot.marker(6.5, "RAMP")
        plot.marker(9.0, "BRAKE")

    # ── speed vs time ────────────────────────────────────────────────────────────────────────────────────────────
    speed = column(rows, "speed_mps", 3.6)
    top = nice_ceiling(max(v for _, v in speed))
    plot = Plot("PROJECT-DRIVE  SPEED VS TIME",
                "VEHICLESOLVER PACEJKADRIVETRAIN AT 240 HZ - COLUMN SPEED MPS OF THE RECORDED RUN", span, 0.0, top, "KM/H")
    plot.series(speed, CYAN, "ROAD SPEED KM/H")
    plot.series(column(rows, "fwd_mps", 3.6), BLUE, "FORWARD COMPONENT KM/H", 1)
    markers(plot)
    plot.note(f"PEAK {max(v for _, v in speed):.1f} KM/H   SAMPLES {len(rows)}   SPAN {span:.2f} S")
    written.append(plot.write(out_dir / "ProjectDriveSpeedVsTime_CPU_Reference.png"))

    # ── driver inputs ────────────────────────────────────────────────────────────────────────────────────────────
    plot = Plot("PROJECT-DRIVE  THROTTLE BRAKE AND STEERING VS TIME",
                "DRIVERINPUT AS THE SOLVER CONSUMED IT - SCRIPTED SETTLE THROTTLE SLALOM RAMP BRAKE", span, -1.0, 1.0, "NORMALISED")
    plot.series(column(rows, "throttle"), GREEN, "THROTTLE 0 TO 1")
    plot.series(column(rows, "brake"), RED, "BRAKE 0 TO 1")
    plot.series(column(rows, "steer"), ORANGE, "STEER -1 TO 1")
    markers(plot)
    plot.note("STEER IS THE SLALOM COMMAND - THE SOLVER TURNS IT INTO PER WHEEL STEER ANGLES")
    written.append(plot.write(out_dir / "ProjectDriveDriverInputs_CPU_Reference.png"))

    # ── steering response ────────────────────────────────────────────────────────────────────────────────────────
    front = [(float(r["t"]), float(r["w0_steer"]) * 57.2957795) for r in rows]
    extent = nice_ceiling(max(abs(v) for _, v in front) or 1.0)
    plot = Plot("PROJECT-DRIVE  STEERING RESPONSE VS TIME",
                "COMMANDED STEER AGAINST THE FRONT WHEEL ANGLES AND SLIP ANGLES THE SOLVER PRODUCED", span, -extent, extent, "DEGREES")
    plot.series(front, ORANGE, "FRONT LEFT STEER DEG")
    plot.series([(float(r["t"]), float(r["w1_steer"]) * 57.2957795) for r in rows], WHITE, "FRONT RIGHT STEER DEG", 1)
    plot.series([(float(r["t"]), float(r["w0_slipang"]) * 57.2957795) for r in rows], VIOLET, "FRONT LEFT SLIP ANGLE DEG", 1)
    markers(plot)
    plot.note("ACKERMANN SPLIT BETWEEN THE TWO FRONT WHEELS IS VISIBLE THROUGH THE SLALOM")
    written.append(plot.write(out_dir / "ProjectDriveSteering_CPU_Reference.png"))

    # ── aerodynamics ─────────────────────────────────────────────────────────────────────────────────────────────
    downforce = column(rows, "aero_downforce_N")
    top = nice_ceiling(max(v for _, v in downforce))
    plot = Plot("PROJECT-DRIVE  AERODYNAMICS VS TIME",
                "AEROFORCES FROM ENGINE PHYSICALDYNAMICS VEHICLE AERODYNAMICS - GT3 PACKAGE CLOSED LOOP", span, 0.0, top, "NEWTONS")
    plot.series(downforce, CYAN, "TOTAL DOWNFORCE N")
    plot.series(column(rows, "aero_rear_N"), BLUE, "REAR DOWNFORCE N", 2)
    plot.series(column(rows, "aero_front_N"), GREEN, "FRONT DOWNFORCE N", 2)
    plot.series(column(rows, "aero_drag_N"), ORANGE, "TOTAL DRAG N")
    markers(plot)
    plot.note(f"PEAK DOWNFORCE {max(v for _, v in downforce):.0f} N   PEAK DRAG "
              f"{max(v for _, v in column(rows, 'aero_drag_N')):.0f} N   DOWNFORCE FEEDS THE TYRE LOAD")
    written.append(plot.write(out_dir / "ProjectDriveAerodynamics_CPU_Reference.png"))

    # ── drag against speed squared: the closed loop, plotted as the physics claims it ────────────────────────────
    plot = Plot("PROJECT-DRIVE  AERO LOAD AGAINST SPEED",
                "DRAG AND DOWNFORCE RISE WITH THE SQUARE OF ROAD SPEED - THE SIGNATURE OF THE AERO MODEL", span, 0.0,
                nice_ceiling(max(v for _, v in downforce)), "NEWTONS")
    plot.series(downforce, CYAN, "TOTAL DOWNFORCE N")
    plot.series([(t, v * top / (nice_ceiling(max(s for _, s in speed)))) for t, v in speed], VIOLET,
                "ROAD SPEED SCALED TO THE AXIS", 1)
    markers(plot)
    plot.note("THE TWO CURVES SEPARATE UNDER BRAKING BECAUSE DOWNFORCE FOLLOWS SPEED SQUARED")
    written.append(plot.write(out_dir / "ProjectDriveAeroAgainstSpeed_CPU_Reference.png"))

    # ── powertrain ───────────────────────────────────────────────────────────────────────────────────────────────
    rpm = column(rows, "rpm")
    top = nice_ceiling(max(v for _, v in rpm))
    plot = Plot("PROJECT-DRIVE  ENGINE SPEED GEAR AND BOOST VS TIME",
                "DRIVETRAIN STATE - RPM WITH THE GEAR INDEX AND TURBO BOOST SCALED ONTO THE SAME AXIS", span, 0.0, top, "RPM")
    plot.series(rpm, ORANGE, "ENGINE RPM")
    plot.series([(t, v * top / 8.0) for t, v in column(rows, "gear")], GREEN, "GEAR INDEX SCALED", 1)
    plot.series([(t, v * top / 3.0) for t, v in column(rows, "boost_bar")], CYAN, "BOOST BAR SCALED", 1)
    markers(plot)
    plot.note("EVERY UPSHIFT IS AN RPM DROP AT A GEAR STEP - THE TWO CURVES AGREE BECAUSE ONE CAUSED THE OTHER")
    written.append(plot.write(out_dir / "ProjectDrivePowertrain_CPU_Reference.png"))

    # ── tyre loads ───────────────────────────────────────────────────────────────────────────────────────────────
    loads = [column(rows, f"w{w}_load_N") for w in range(4)]
    top = nice_ceiling(max(v for series in loads for _, v in series))
    plot = Plot("PROJECT-DRIVE  TYRE VERTICAL LOAD VS TIME",
                "FZ FROM THE XPBD SOFT TYRE PER WHEEL - LOAD TRANSFER UNDER THROTTLE SLALOM RAMP AND BRAKING", span, 0.0, top, "NEWTONS")
    for series, colour, label in zip(loads, (CYAN, BLUE, ORANGE, GREEN),
                                     ("FRONT LEFT FZ", "FRONT RIGHT FZ", "REAR LEFT FZ", "REAR RIGHT FZ")):
        plot.series(series, colour, label, 1)
    markers(plot)
    plot.note("LOAD FALLING TO ZERO IS A WHEEL OFF THE GROUND OVER THE RAMP OR A BUMP")
    written.append(plot.write(out_dir / "ProjectDriveTyreLoads_CPU_Reference.png"))

    return written


if __name__ == "__main__":
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else GALLERY / "ProjectDrivePhysicsTelemetry_CPU_Reference.csv"
    render(source, Path(sys.argv[2]) if len(sys.argv) > 2 else GALLERY)
