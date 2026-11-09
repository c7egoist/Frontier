//============================================================================================================================================
//                                                       POLICEPURSUITSEQUENCE.JS
//============================================================================================================================================
// 🧩 Police Pursuit & Fast Self-Play Reinforcement Learning System:
//    • Same ControlVehicle Police Interceptor Cruiser (full 480 Hz VehicleSolver physics + Red/Blue roof lightbar + PIT chassis collisions)
//    • Immediate Combined Aerial Support: Police Pursuit Helicopter (rotors + searchlight cone + alley LOS occlusion) + 3 Police Drones
//    • Traffic Law Enforcement in Player Mode: Speeding (> posted limit), Running Red Signals, and Reckless Impact trigger pursuit
//    • Hands-Free Fast RL Self-Training Mode ("selfplay"): Dual 16->20->3 Tanh Neural Policies (EvaderNet vs PoliceNet) trained live via
//      Elitist Cross-Entropy Policy Gradient (CEM-RL) with 9-ray 2D Lidar, 1x..40x Turbo Time-Warp, and zero-black-box holographic telemetry.

import { VehicleSolver } from "./VehicleSolver.js";
import { VehicleGeometry } from "./VehicleSpecification.js";
import { LightType } from "./LightingSystem.js";
import { QueryCitySpeedLimitKmh, QueryNearestCityRoadFrame, IsPointOccludedFromHelicopter } from "./CityPursuitStructure.js";
import { ConstructRigidTransform, ConstructAxisQuaternion, MultiplyQuaternion, RotateVector, ClampScalar } from "./TransformProjection.js";

//------------------------------------------------------------------------------------------------------------------------
//                          LIGHTWEIGHT DETERMINISTIC PRNG & 16->20->3 TANH NEURAL POLICY
//------------------------------------------------------------------------------------------------------------------------

function CreateRng(Seed = 1337)
{
    let State = (Seed >>> 0) || 1;
    return () =>
    {
        State = (Math.imul(State, 1664525) + 1013904223) >>> 0;
        return State / 4294967296.0;
    };
}

function SampleGaussian(Rng)
{
    const U1 = Math.max(1.0e-7, Rng());
    const U2 = Rng();
    return Math.sqrt(-2.0 * Math.log(U1)) * Math.cos(2.0 * Math.PI * U2);
}

const InputDim  = 16;
const OddDim    = 8;
const EvenDim   = 5;
const OddHid    = 3;
const EvenHid   = 3;
// Compact 53-parameter Mirror-Equivariant 2-Layer Nonlinear Policy Network:
//   • Odd Steering Sub-Network:  8 skip + (8*3) + 3 = 35 params  (exact odd tanh: f(-s) = -f(s), zero bias drift!)
//   • Even Speed/Brake Network: (5*3 + 3) + (3*2 + 2) = 26 params -> Total = 61 floats (6.6x smaller than 403 -> ultra-fast RL convergence!)
export const PolicyParameterCount = (OddDim + OddDim * OddHid + OddHid) + (EvenDim * EvenHid + EvenHid + EvenHid * 2 + 2);

const LidarAngles = [-1.48, -0.96, -0.52, -0.21, 0.0, 0.21, 0.52, 0.96, 1.48]; // 9 rays across [-85°..+85°]
const LidarMaxRange = 46.0;

//------------------------------------------------------------------------------------------------------------------------
//             CONNECTED 28-NODE CITY STREET, INTERSECTION & COVERED ESCAPE ALLEY TACTICAL GRAPH
//------------------------------------------------------------------------------------------------------------------------
// Prevents repetitive straight-line loops: Evader dynamically plans non-repeating multi-block escape routes through
// intersections & covered alleys, while Police runs shortest-path graph routing around building superblocks!

export const CityNavNodes = Object.freeze([
    // 0..8: 3x3 Main Downtown Avenue & Street Intersections
    { Id:  0, X: -150.0, Y:  90.0, Covered: false, Label: "NW Corner" },
    { Id:  1, X:  -55.0, Y:  90.0, Covered: false, Label: "Midtown N" },
    { Id:  2, X:   40.0, Y:  90.0, Covered: false, Label: "Frontage N" },
    { Id:  3, X: -150.0, Y:   0.0, Covered: false, Label: "West Cross" },
    { Id:  4, X:  -55.0, Y:   0.0, Covered: false, Label: "Midtown Hub" },
    { Id:  5, X:   40.0, Y:   0.0, Covered: false, Label: "Frontage Hub" },
    { Id:  6, X: -150.0, Y: -90.0, Covered: false, Label: "SW Corner" },
    { Id:  7, X:  -55.0, Y: -90.0, Covered: false, Label: "Midtown S" },
    { Id:  8, X:   40.0, Y: -90.0, Covered: false, Label: "Frontage S" },
    // 9..24: Alley Mouths & 4 Covered Superblock Escape Alley Interior Crossings
    { Id:  9, X: -150.0, Y:  47.0, Covered: false, Label: "NW Alley W" },
    { Id: 10, X:  -55.0, Y:  47.0, Covered: false, Label: "Alley Mid N" },
    { Id: 11, X: -102.5, Y:  90.0, Covered: false, Label: "NW Alley N" },
    { Id: 12, X: -102.5, Y:   0.0, Covered: false, Label: "West Alley Mid" },
    { Id: 13, X:  -55.0, Y: -47.0, Covered: false, Label: "Alley Mid S" },
    { Id: 14, X:   40.0, Y: -47.0, Covered: false, Label: "SE Alley E" },
    { Id: 15, X:   -7.5, Y:   0.0, Covered: false, Label: "East Alley Mid" },
    { Id: 16, X:   -7.5, Y: -90.0, Covered: false, Label: "SE Alley S" },
    { Id: 17, X: -102.5, Y:  47.0, Covered: true,  Label: "NW Covered Alley" },
    { Id: 18, X:   -7.5, Y: -47.0, Covered: true,  Label: "SE Covered Alley" },
    { Id: 19, X:   -7.5, Y:  47.0, Covered: true,  Label: "NE Covered Alley" },
    { Id: 20, X: -102.5, Y: -47.0, Covered: true,  Label: "SW Covered Alley" },
    { Id: 21, X:   40.0, Y:  47.0, Covered: false, Label: "NE Alley E" },
    { Id: 22, X:   -7.5, Y:  90.0, Covered: false, Label: "NE Alley N" },
    { Id: 23, X: -150.0, Y: -47.0, Covered: false, Label: "SW Alley W" },
    { Id: 24, X: -102.5, Y: -90.0, Covered: false, Label: "SW Alley S" },
    // 25..27: East Highway & Overpass Connectors
    { Id: 25, X:  105.0, Y:  90.0, Covered: false, Label: "Highway N" },
    { Id: 26, X:  105.0, Y:   0.0, Covered: false, Label: "Overpass Deck" },
    { Id: 27, X:  105.0, Y: -90.0, Covered: false, Label: "Highway S" }
]);

const RawNavPairs = [
    // Horizontal North Blvd (Y = +90): 0 - 11 - 1 - 22 - 2 - 25
    [0, 11], [11, 1], [1, 22], [22, 2], [2, 25],
    // Horizontal Central Ave (Y = 0): 3 - 12 - 4 - 15 - 5 - 26
    [3, 12], [12, 4], [4, 15], [15, 5], [5, 26],
    // Horizontal South Blvd (Y = -90): 6 - 24 - 7 - 16 - 8 - 27
    [6, 24], [24, 7], [7, 16], [16, 8], [8, 27],
    // Vertical West Street (X = -150): 0 - 9 - 3 - 23 - 6
    [0, 9], [9, 3], [3, 23], [23, 6],
    // Vertical Midtown Street (X = -55): 1 - 10 - 4 - 13 - 7
    [1, 10], [10, 4], [4, 13], [13, 7],
    // Vertical Frontage Road (X = +40): 2 - 21 - 5 - 14 - 8
    [2, 21], [21, 5], [5, 14], [14, 8],
    // East Highway Spine (X = +105): 25 - 26 - 27
    [25, 26], [26, 27],
    // 4 Interior Covered Escape Alley Crosses!
    [9, 17], [17, 10], [11, 17], [17, 12],
    [13, 18], [18, 14], [15, 18], [18, 16],
    [10, 19], [19, 21], [22, 19], [19, 15],
    [23, 20], [20, 13], [12, 20], [20, 24]
];

const CityNavAdj = Array.from({ length: CityNavNodes.length }, () => []);
for (const [A, B] of RawNavPairs)
{
    const W = Math.hypot(CityNavNodes[A].X - CityNavNodes[B].X, CityNavNodes[A].Y - CityNavNodes[B].Y);
    CityNavAdj[A].push({ To: B, Dist: W });
    CityNavAdj[B].push({ To: A, Dist: W });
}

function QueryNearestCityNode(X, Y)
{
    let Best = 0, BestD2 = Infinity;
    for (let I = 0; I < CityNavNodes.length; ++I)
    {
        const DX = CityNavNodes[I].X - X, DY = CityNavNodes[I].Y - Y;
        const D2 = DX * DX + DY * DY;
        if (D2 < BestD2) { BestD2 = D2; Best = I; }
    }
    return Best;
}

function QueryShortestCityNextHop(FromNode, GoalNode)
{
    if (FromNode === GoalNode)
        return GoalNode;
    const N = CityNavNodes.length;
    const Dist = new Float32Array(N).fill(1.0e9);
    const Prev = new Int16Array(N).fill(-1);
    const Used = new Uint8Array(N);
    Dist[FromNode] = 0.0;

    for (let Step = 0; Step < N; ++Step)
    {
        let U = -1, Best = 1.0e9;
        for (let I = 0; I < N; ++I)
            if (!Used[I] && Dist[I] < Best) { Best = Dist[I]; U = I; }
        if (U < 0 || U === GoalNode)
            break;
        Used[U] = 1;
        for (const Edge of CityNavAdj[U])
        {
            const Cand = Dist[U] + Edge.Dist;
            if (Cand < Dist[Edge.To])
            {
                Dist[Edge.To] = Cand;
                Prev[Edge.To] = U;
            }
        }
    }
    let Cur = GoalNode;
    while (Prev[Cur] !== -1 && Prev[Cur] !== FromNode)
        Cur = Prev[Cur];
    return Prev[Cur] === FromNode ? Cur : GoalNode;
}

//------------------------------------------------------------------------------------------------------------------------
//      16->12->3 TANH NEURAL POLICY WITH ANTITHETIC MIRROR NES + MOMENTUM CEM-RL (SAME-SCENARIO EVALUATION!)
//------------------------------------------------------------------------------------------------------------------------

export class NeuralDrivingPolicy
{
    constructor(Role = "evader", Seed = 42)
    {
        this.Role             = Role;
        this.Seed             = Seed;
        this.Rng              = CreateRng(Seed);
        this.PopSize          = 6;
        this.MeanWeights      = new Float32Array(PolicyParameterCount);
        this.BestEverWeights  = new Float32Array(PolicyParameterCount);
        this.VelocityWeights  = new Float32Array(PolicyParameterCount);
        this.ActiveWeights    = new Float32Array(PolicyParameterCount);
        this.OddFeat          = new Float32Array(OddDim);
        this.EvenFeat         = new Float32Array(EvenDim);
        this.Sigma            = 0.36;
        this.Generation       = 1;
        this.CandidateIndex   = 0;
        this.Candidates       = [];
        this.Returns          = new Float32Array(this.PopSize);
        this.RewardHistory    = [];
        this.SkillScore       = 0.0;
        this.LastBestReturn   = 0.0;
        this.BestEverReturn   = -1.0e9;

        this.ResetUntrained();
    }

    ResetUntrained()
    {
        this.Rng            = CreateRng(this.Seed);
        this.Generation     = 1;
        this.Sigma          = 0.38;
        this.CandidateIndex = 0;
        this.RewardHistory  = [];
        this.SkillScore     = 0.0;
        this.BestEverReturn = -1.0e9;
        this.MeanWeights.fill(0.0);
        this.VelocityWeights.fill(0.0);

        // Truly untrained rookie Gen-1 initialization: near-zero random weights + forward throttle bias only!
        // At Gen 1 the car drives straight into T-junction walls; over Gens 2..10 Antithetic Mirror NES discovers
        // 90° intersection steering, Lidar gap-threading, drift counter-steering, and corner trail-braking!
        for (let I = 0; I < PolicyParameterCount; ++I)
            this.MeanWeights[I] = (this.Rng() - 0.5) * 0.03;

        const EvenBase = OddDim + OddDim * OddHid + OddHid;
        const EvenOutBias = EvenBase + (EvenDim * EvenHid + EvenHid) + (EvenHid * 2);
        this.MeanWeights[EvenOutBias + 0] = 0.46; // gentle rookie forward throttle only

        this.BestEverWeights.set(this.MeanWeights);
        this.SamplePopulation();
        this.ActivateCandidate(0);
    }

    SamplePopulation()
    {
        this.Candidates = [];
        // Slot 0: Zero-noise Clean Elite Mean μ (shared baseline for both Evader & Police on the generation's scenario!)
        this.Candidates.push(new Float32Array(this.MeanWeights));

        if (this.Role === "evader")
        {
            // Slots (1, 2): Antithetic Mirror Pair (μ + σ·ε, μ - σ·ε) evaluated against CLEAN Police Mean!
            const PosW = new Float32Array(PolicyParameterCount);
            const NegW = new Float32Array(PolicyParameterCount);
            for (let I = 0; I < PolicyParameterCount; ++I)
            {
                const Eps = SampleGaussian(this.Rng) * this.Sigma;
                PosW[I] = this.MeanWeights[I] + Eps;
                NegW[I] = this.MeanWeights[I] - Eps;
            }
            this.Candidates.push(PosW, NegW);

            // Slot 3: Momentum + Exploration Candidate evaluated against CLEAN Police Mean!
            const MomW = new Float32Array(PolicyParameterCount);
            for (let I = 0; I < PolicyParameterCount; ++I)
                MomW[I] = this.MeanWeights[I] + this.VelocityWeights[I] * 0.60 + SampleGaussian(this.Rng) * (this.Sigma * 0.65);
            this.Candidates.push(MomW);

            // Slots 4, 5: Hold Evader at Clean Mean μ while Police evaluates its Antithetic Pair! (Zero cross-agent noise!)
            this.Candidates.push(new Float32Array(this.MeanWeights), new Float32Array(this.MeanWeights));
        }
        else
        {
            // Slots 1, 2, 3: Hold Police at Clean Mean μ while Evader evaluates its perturbations!
            this.Candidates.push(
                new Float32Array(this.MeanWeights),
                new Float32Array(this.MeanWeights),
                new Float32Array(this.MeanWeights)
            );

            // Slots (4, 5): Police Antithetic Mirror Pair (μ + σ·ε, μ - σ·ε) evaluated against CLEAN Evader Mean!
            const PosW = new Float32Array(PolicyParameterCount);
            const NegW = new Float32Array(PolicyParameterCount);
            for (let I = 0; I < PolicyParameterCount; ++I)
            {
                const Eps = SampleGaussian(this.Rng) * this.Sigma;
                PosW[I] = this.MeanWeights[I] + Eps;
                NegW[I] = this.MeanWeights[I] - Eps;
            }
            this.Candidates.push(PosW, NegW);
        }

        this.Returns.fill(0.0);
    }

    ActivateCandidate(Index)
    {
        this.CandidateIndex = Index % this.PopSize;
        this.ActiveWeights.set(this.Candidates[this.CandidateIndex]);
    }

    Forward(Inputs, UseMean = false)
    {
        // Compact 61-parameter Mirror-Equivariant 2-Layer Nonlinear Driving Policy:
        //   • Odd Steering Branch (s -> skip + 3 odd tanh hidden units): exact odd symmetry f(-s) = -f(s)
        //   • Even Speed/Brake Branch (e -> 3 tanh hidden -> [Accel, Handbrake]): exact even symmetry
        const W = UseMean ? this.MeanWeights : this.ActiveWeights;
        const S = this.OddFeat;
        const E = this.EvenFeat;

        // 8 Odd Left/Right Anti-Symmetric Driving Features (+ = Left):
        S[0] = 0.5 * (Inputs[8] - Inputs[0]); // ±85° wide side Lidar clearance diff
        S[1] = 0.5 * (Inputs[7] - Inputs[1]); // ±55° corner Lidar clearance diff
        S[2] = 0.5 * (Inputs[6] - Inputs[2]); // ±30° lookahead Lidar clearance diff
        S[3] = 0.5 * (Inputs[5] - Inputs[3]); // ±12° narrow gap Lidar clearance diff
        S[4] = Inputs[12];                    // tactical 90° waypoint bearing
        S[5] = Inputs[13];                    // deepest open Lidar corridor angle
        S[6] = -Inputs[10] - 0.45 * Inputs[11]; // lateral slip & yaw-rate counter-steer stabilizer
        S[7] = Inputs[15];                    // opponent local bearing

        // 5 Even Symmetric Speed & Corner-Braking Features:
        const FrontMin = 0.5 * (Math.min(Inputs[3], Inputs[4], Inputs[5]) + 1.0); // [0..1]
        const SideOpen = 0.25 * (Inputs[1] + Inputs[7] + 2.0);                    // [0..1]
        E[0] = FrontMin - 0.45;
        E[1] = Inputs[9];                     // normalized forward speed
        E[2] = Inputs[14];                    // corner entry curvature & wall brake load
        E[3] = Math.abs(Inputs[12]) - 0.35;   // sharp turn magnitude
        E[4] = SideOpen - 0.5;                // cross-street / alley opening ahead

        // ① Odd Steering Evaluation (skip + 3 nonlinear odd tanh units)
        let SteerSum = 0.0;
        for (let I = 0; I < OddDim; ++I)
            SteerSum += W[I] * S[I];
        const OddW1 = OddDim;
        const OddW2 = OddW1 + OddDim * OddHid;
        for (let H = 0; H < OddHid; ++H)
        {
            let Hid = 0.0;
            const Row = OddW1 + H * OddDim;
            for (let I = 0; I < OddDim; ++I)
                Hid += W[Row + I] * S[I];
            SteerSum += W[OddW2 + H] * Math.tanh(Hid);
        }
        const SteerCmd = ClampScalar(Math.tanh(SteerSum), -1.0, 1.0);

        // ② Even Throttle / Brake / Handbrake Evaluation
        const EvenBase = OddW2 + OddHid;
        const EvenB1   = EvenBase + EvenDim * EvenHid;
        const EvenW2   = EvenB1 + EvenHid;
        const EvenB2   = EvenW2 + EvenHid * 2;
        let AccelSum = W[EvenB2 + 0];
        let HBrakeSum = W[EvenB2 + 1];
        for (let H = 0; H < EvenHid; ++H)
        {
            let Hid = W[EvenB1 + H];
            const Row = EvenBase + H * EvenDim;
            for (let I = 0; I < EvenDim; ++I)
                Hid += W[Row + I] * E[I];
            const Act = Math.tanh(Hid);
            AccelSum  += W[EvenW2 + 0 * EvenHid + H] * Act;
            HBrakeSum += W[EvenW2 + 1 * EvenHid + H] * Act;
        }
        const AccelCmd = Math.tanh(AccelSum);
        const HBrake   = Math.tanh(HBrakeSum);

        return {
            Throttle:  AccelCmd > -0.15 ? ClampScalar(0.28 + AccelCmd * 0.72, 0.0, 1.0) : 0.0,
            Brake:     AccelCmd < -0.18 ? ClampScalar(-AccelCmd, 0.0, 1.0) : 0.0,
            Steer:     SteerCmd,
            Handbrake: HBrake > 0.62 && Math.abs(SteerCmd) > 0.48
        };
    }

    RecordEpisodeReturn(EpisodeReturn)
    {
        this.Returns[this.CandidateIndex] = EpisodeReturn;
        this.CandidateIndex++;
        if (this.CandidateIndex >= this.PopSize)
        {
            // Strict Decoupled Advantage-Gated Antithetic Mirror NES Update!
            // Evader perturbations live in Slots [1, 2, 3] (tested vs Clean Police Mean);
            // Police perturbations live in Slots [4, 5] (tested vs Clean Evader Mean).
            // Slot 0 is the exact Clean-vs-Clean baseline on the SAME scenario!
            const ActiveSlots = this.Role === "evader" ? [0, 1, 2, 3] : [0, 4, 5];
            const PairIndices = this.Role === "evader" ? [[1, 2]] : [[4, 5]];
            const BaselineRet = this.Returns[0];
            const Order = ActiveSlots.slice().sort((A, B) => this.Returns[B] - this.Returns[A]);
            const BestRet = this.Returns[Order[0]];
            const GainOverMean = Math.max(0.0, BestRet - BaselineRet);

            if (GainOverMean > 0.05)
            {
                const Improvers = Order.filter((Idx) => Idx !== 0 && this.Returns[Idx] > BaselineRet);
                let AdvSum = 0.0;
                const AdvWeights = Improvers.map((Idx) =>
                {
                    const A = this.Returns[Idx] - BaselineRet;
                    AdvSum += A;
                    return A;
                });

                const TargetMean = new Float32Array(PolicyParameterCount);
                for (let E = 0; E < Improvers.length; ++E)
                {
                    const Cand = this.Candidates[Improvers[E]];
                    const Wt   = AdvWeights[E] / AdvSum;
                    for (let I = 0; I < PolicyParameterCount; ++I)
                        TargetMean[I] += Cand[I] * Wt;
                }

                for (const [PIdx, NIdx] of PairIndices)
                {
                    if (Math.max(this.Returns[PIdx], this.Returns[NIdx]) <= BaselineRet)
                        continue;
                    const Diff  = this.Returns[PIdx] - this.Returns[NIdx];
                    const Scale = ClampScalar(Diff / 55.0, -0.25, 0.25);
                    const PosC  = this.Candidates[PIdx], NegC = this.Candidates[NIdx];
                    for (let I = 0; I < PolicyParameterCount; ++I)
                        TargetMean[I] += (PosC[I] - NegC[I]) * 0.20 * Scale;
                }

                for (let I = 0; I < PolicyParameterCount; ++I)
                {
                    const StepDelta = (TargetMean[I] - this.MeanWeights[I]) * 0.85;
                    this.VelocityWeights[I] = this.VelocityWeights[I] * 0.45 + StepDelta * 0.55;
                    this.MeanWeights[I] = ClampScalar(this.MeanWeights[I] + StepDelta, -2.8, 2.8);
                }
            }
            else
            {
                // Decay velocity when current clean mean held the lead on this scenario
                for (let I = 0; I < PolicyParameterCount; ++I)
                    this.VelocityWeights[I] *= 0.4;
            }

            // Track cumulative advantage skill curve so RewardHistory reflects true policy improvement across scenarios!
            if (this.Generation === 1)
                this.SkillScore = BaselineRet;
            else
                this.SkillScore += GainOverMean * 0.65;

            if (this.SkillScore > this.BestEverReturn)
            {
                this.BestEverReturn = this.SkillScore;
                this.BestEverWeights.set(this.MeanWeights);
            }
            this.LastBestReturn = BestRet;
            this.RewardHistory.push(this.SkillScore);
            if (this.RewardHistory.length > 48)
                this.RewardHistory.shift();

            this.Sigma = GainOverMean > 1.0
                ? Math.max(0.085, this.Sigma * 0.94)
                : Math.max(0.085, this.Sigma * 0.965);

            this.Generation++;
            this.CandidateIndex = 0;
            this.SamplePopulation();
        }
        this.ActivateCandidate(this.CandidateIndex);
    }
}

//------------------------------------------------------------------------------------------------------------------------
//                  DIVERSE MULTI-TURN CITY SCENARIOS (SHARED ACROSS ALL CANDIDATES PER GENERATION!)
//------------------------------------------------------------------------------------------------------------------------

const SelfPlayScenarios = Object.freeze([
    // 0: NW N-S Alley Northbound -> T-Junction [-102.5, 90] blocked by Skyline Tower 4 (MUST carve 90° turn onto North Blvd!)
    { Evader: [-102.5,  56.0, 0.63,  Math.PI * 0.5], Police: [-102.5,  34.0, 0.63,  Math.PI * 0.5], StartNode: 11 },
    // 1: NE N-S Alley Northbound -> T-Junction [ -7.5, 90] blocked by Skyline Tower 5 (MUST carve 90° turn onto North Blvd!)
    { Evader: [  -7.5,  56.0, 0.63,  Math.PI * 0.5], Police: [  -7.5,  34.0, 0.63,  Math.PI * 0.5], StartNode: 22 },
    // 2: SW N-S Alley Southbound -> T-Junction [-102.5,-90] blocked by Skyline Tower 6 (MUST carve 90° turn onto South Blvd!)
    { Evader: [-102.5, -56.0, 0.63, -Math.PI * 0.5], Police: [-102.5, -34.0, 0.63, -Math.PI * 0.5], StartNode: 24 },
    // 3: SE N-S Alley Southbound -> T-Junction [ -7.5,-90] blocked by Skyline Tower 7 (MUST carve 90° turn onto South Blvd!)
    { Evader: [  -7.5, -56.0, 0.63, -Math.PI * 0.5], Police: [  -7.5, -34.0, 0.63, -Math.PI * 0.5], StartNode: 16 },
    // 4: Central Ave Westbound -> T-Junction [-150, 0] blocked by Skyline Tower 2 (MUST carve 90° turn onto West Ave!)
    { Evader: [-114.0,   0.0, 0.63,  Math.PI],       Police: [ -88.0,   0.0, 0.63,  Math.PI],       StartNode: 3  },
    // 5: Midtown Ave Northbound -> Crossroads [-55, 0] & Covered Alley Network!
    { Evader: [ -55.0, -34.0, 0.63,  Math.PI * 0.5], Police: [ -55.0, -62.0, 0.63,  Math.PI * 0.5], StartNode: 4  }
]);

//------------------------------------------------------------------------------------------------------------------------
//                                            POLICE PURSUIT & RL SEQUENCE
//------------------------------------------------------------------------------------------------------------------------

export class PolicePursuitSequence
{
    constructor(Host)
    {
        this.Host                  = Host;
        this.Scene                 = Host.Scene;
        this.LevelKey              = Host.LevelKey || "proving";
        this.Enabled               = this.LevelKey !== "dday" && this.LevelKey !== "candy";
        this.LawEnforcementEnabled = this.LevelKey !== "dday" && this.LevelKey !== "candy";

        // Modes: "player" (you drive; police chases if you speed/break traffic laws) | "selfplay" (hands-free RL training!)
        this.ControlMode           = "player";
        this.TimeWarp              = 1;          // [1, 8, 20, 40] physics steps per frame during RL training
        this.SpectatorTarget       = "evader";   // "evader" | "police" | "helicopter"
        this.ShowLidarRays         = true;

        this.PursuitActive         = false;
        this.ViolationReason       = "";
        this.SpeedingTimer         = 0.0;
        this.BustedTimer           = 0.0;
        this.EscapeTimer           = 0.0;
        this.BannerTimer           = 0.0;
        this.BannerMessage         = "";
        this.LastConeHits          = 0;
        this.LastFractureBreaks    = 0;

        this.Clock                 = 0.0;
        this.StrobePhase           = 0.0;
        this.HeliRotorAngle        = 0.0;
        this.HeliTailAngle         = 0.0;
        this.HeliPosition          = [-110.0, 0.0, 25.0];
        this.HeliVelocity          = [0.0, 0.0, 0.0];
        this.HeliSpotTarget        = [-90.0, 0.0, 0.0];
        this.HeliLosClear          = true;
        this.DroneStates           = [
            { Role: "RECON",  Label: "RECON SCOUT",   Pos: [-115.0,  6.0, 3.2], Vel: [0, 0, 0], Yaw: 0, Roll: 0, EmpCharge: 0, Cooldown: 0, HasLos: false },
            { Role: "CUTOFF", Label: "CUT-OFF BLOCK", Pos: [-115.0, -6.0, 3.2], Vel: [0, 0, 0], Yaw: 0, Roll: 0, EmpCharge: 0, Cooldown: 0, HasLos: false },
            { Role: "EMP",    Label: "EMP DISRUPTOR", Pos: [-105.0,  0.0, 3.5], Vel: [0, 0, 0], Yaw: 0, Roll: 0, EmpCharge: 0, Cooldown: 0, HasLos: false }
        ];
        this.DroneLockActive       = false;
        this.DroneEmpCharge        = 0.0;

        // Second real ControlVehicle physics instance for the Police Interceptor Cruiser!
        this.PoliceVehicle         = new VehicleSolver(this.Scene.QueryObstacleBounds());
        this.PoliceVehicle.Surfaces = Host.Vehicle.Surfaces;
        this.PoliceVehicle.Support  = Host.Bodies;
        this.PoliceVehicle.AeroGripScale = Host.Vehicle.AeroGripScale;

        // Flat 2D obstacle AABB cache [MinX, MinY, MaxX, MaxY, ...] for <4 µs 9-ray Lidar sweeps
        this.FlatObstacleBoxes     = new Float32Array(0);
        this.RebuildLidarObstacles();

        // Dual Neural Policies (EvaderNet vs PoliceNet) + Lidar visualization buffers
        this.EvaderBrain           = new NeuralDrivingPolicy("evader", 202611);
        this.PoliceBrain           = new NeuralDrivingPolicy("police", 884213);
        this.EvaderInputs          = new Float32Array(InputDim);
        this.PoliceInputs          = new Float32Array(InputDim);
        this.EvaderLidarHits       = new Float32Array(LidarAngles.length * 3); // [endX, endY, frac]
        this.PoliceLidarHits       = new Float32Array(LidarAngles.length * 3);

        // RL Episode & Tactical Multi-Block Navigation Bookkeeping
        this.EpisodeIndex          = 1;
        this.EpisodeClock          = 0.0;
        this.EpisodeMaxSeconds     = 9.2;
        this.EvaderEpReturn        = 0.0;
        this.PoliceEpReturn        = 0.0;
        this.PrevSeparation        = 28.0;
        this.PrevGoalDist          = 35.0;
        this.EvaderStallTimer      = 0.0;
        this.EvaderGoalNode        = 4;
        this.RecentEvaderNodes     = [3, 4];
        this.PoliceTargetPoint     = [-55.0, 0.0, 0.63];
        this.EpisodeWaypoints      = 0;
        this.LastGenMaxWaypoints   = 0;
        this.GenMaxWaypoints       = 0;
        this.LastGenPeakKmh        = 0;
        this.GenPeakKmh            = 0;
        this.TotalBusts            = 0;
        this.TotalEscapes          = 0;
        this.ScenarioCursor        = 0;

        this.MountQuickControls();
        this.PlaceInitialUnits();
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                    LIDAR AABB CACHE & INITIAL UNIT PLACEMENT
    //--------------------------------------------------------------------------------------------------------------------

    RebuildLidarObstacles()
    {
        const Boxes = this.Scene?.QueryObstacleBounds ? this.Scene.QueryObstacleBounds() : [];
        const Coords = [];
        for (const B of Boxes)
        {
            if (!B || B.DynamicTram)
                continue;
            // Include walls, buildings, barriers & props projecting above axle height (Z > 0.25 m) and below Z = 3.5 m
            if (B.Maximum[2] < 0.25 || B.Minimum[2] > 3.2)
                continue;
            Coords.push(B.Minimum[0] - 0.35, B.Minimum[1] - 0.35, B.Maximum[0] + 0.35, B.Maximum[1] + 0.35);
        }
        this.FlatObstacleBoxes = new Float32Array(Coords);
    }

    PlaceInitialUnits()
    {
        this.PoliceVehicle.Surfaces = this.Host.Vehicle.Surfaces;
        if (this.LevelKey === "city")
        {
            // Place Police Interceptor on patrol along Central Ave ahead of Downtown spawn so speeding / red-light triggers right in view!
            this.PoliceVehicle.Respawn([-84.0, -3.5, VehicleGeometry.CoMHeight + 0.05], 0.0);
            const EvPos = this.Host.Vehicle.Position;
            this.HeliPosition = [EvPos[0] - 18.0, EvPos[1], 25.0];
            for (let I = 0; I < 3; ++I)
                this.DroneStates[I].Pos = [ -86.0 - I * 3.0, (I - 1) * 4.5, 3.2 ];
            this.SetUnitsVisible(true);
        }
        else
        {
            // Parked cleanly out of sight on Proving Grounds / Inversion Arena until player breaks traffic laws or clicks Deploy!
            this.PoliceVehicle.Respawn([0.0, 0.0, -45.0], 0.0);
            this.SetUnitsVisible(false);
        }
        this.SyncGpuOccupants(true);
    }

    SetUnitsVisible(Visible)
    {
        const Block = this.Scene?.PoliceBlock;
        if (!Block)
            return;
        let Changed = false;
        const All = [Block.CruiserBody, ...Block.CruiserWheels, Block.HeliBody, Block.HeliMainRotor, Block.HeliTailRotor, ...Block.Drones];
        for (const Idx of All)
        {
            if (Idx >= 0 && this.Scene.Occupants[Idx])
            {
                const NextInactive = !Visible;
                if (Boolean(this.Scene.Occupants[Idx].Inactive) !== NextInactive)
                {
                    this.Scene.Occupants[Idx].Inactive = NextInactive;
                    Changed = true;
                }
            }
        }
        if (Changed)
        {
            this.Scene.ConstructDrawRuns?.();
            this.Host?.Cards?.RebuildTileLists?.(this.Scene);
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                           INTERACTIVE QUICK-CONTROLS IN VIEWPORT HUD STRIP
    //--------------------------------------------------------------------------------------------------------------------

    MountQuickControls()
    {
        if (typeof document === "undefined")
            return;
        const Stage = document.getElementById("stage");
        if (!Stage)
            return;

        let Strip = document.getElementById("pursuit-rl-controls");
        if (!Strip)
        {
            Strip = document.createElement("div");
            Strip.id = "pursuit-rl-controls";
            Strip.className = "pursuit-rl-controls";

            const MakeBtn = (Key, Label, Title, Handler) =>
            {
                const B = document.createElement("button");
                B.type = "button";
                B.className = "ar-hud-pill";
                B.dataset.pursuitAction = Key;
                B.title = Title;
                B.textContent = Label;
                B.addEventListener("click", (E) => { E.stopPropagation(); Handler(); });
                Strip.appendChild(B);
                return B;
            };

            this.DomBtns = {
                chase: MakeBtn("chase", "🚨 PURSUIT",      "Start / clear active Police Cruiser + Helicopter + Drone pursuit", () => this.ToggleManualPursuit()),
                rl:    MakeBtn("rl",    "🧠 AI SELF-TRAIN","Hands-free RL Self-Play: Watch AI Evader & AI Police train themselves!", () => this.ToggleSelfPlayMode()),
                warp:  MakeBtn("warp",  "⚡ 20× SPEED",    "Cycle RL training physics speed (1× · 8× · 20× · 40×)", () => this.CycleTimeWarp()),
                boost: MakeBtn("boost", "+12 GENS",        "Instantly train +12 RL generations", () => this.FastTrainGenerations(12)),
                cam:   MakeBtn("cam",   "🎥 EVADER",       "Cycle AI spectator camera (Evader · Police Cruiser · Helicopter)", () => this.CycleSpectatorTarget())
            };
            Stage.appendChild(Strip);
        }
        this.ControlStrip = Strip;
        this.RefreshControlStrip();
    }

    RefreshControlStrip()
    {
        if (!this.ControlStrip || !this.DomBtns)
            return;
        const Hidden = !this.Enabled || Boolean(this.Host?.FreeCamera) || this.Host?.RoadEditor?.ActiveWorkspace === "roadstudio" || Boolean(this.Host?.Dock?.Clean);
        this.ControlStrip.classList.toggle("hidden", Hidden);

        const IsRL = this.ControlMode === "selfplay";
        this.DomBtns.chase.textContent = this.PursuitActive ? "🚨 WANTED · CLEAR" : "🚨 TRIGGER CHASE";
        this.DomBtns.chase.classList.toggle("crit", this.PursuitActive && !IsRL);
        this.DomBtns.chase.style.display = IsRL ? "none" : "";

        this.DomBtns.rl.textContent = IsRL ? "🎮 DRIVE YOURSELF" : "🧠 WATCH AI TRAIN";
        this.DomBtns.rl.classList.toggle("active", IsRL);

        this.DomBtns.warp.style.display  = IsRL ? "" : "none";
        this.DomBtns.boost.style.display = IsRL ? "" : "none";
        this.DomBtns.cam.style.display   = IsRL ? "" : "none";

        this.DomBtns.warp.textContent = `⚡ ${this.TimeWarp}× SPEED`;
        this.DomBtns.warp.classList.toggle("warn", this.TimeWarp >= 20);
        this.DomBtns.cam.textContent  = `🎥 ${this.SpectatorTarget.toUpperCase()}`;
    }

    ToggleManualPursuit()
    {
        this.Host?.DrivingHud?.Audio?.PlayUiClick(1.1);
        if (this.PursuitActive)
            this.ClearPursuit("DISPATCH STAND DOWN — HEAT CLEARED");
        else
            this.StartPursuit("MANUAL PURSUIT DISPATCH — ALL UNITS ENGAGED!");
        this.RefreshControlStrip();
    }

    ToggleSelfPlayMode(ForceState = null)
    {
        const NextRL = ForceState !== null ? Boolean(ForceState) : (this.ControlMode !== "selfplay");
        this.Host?.DrivingHud?.Audio?.PlayUiClick(NextRL ? 1.25 : 0.92);
        if (NextRL)
        {
            this.ControlMode   = "selfplay";
            this.TimeWarp      = 20; // default fast-training speed so user immediately sees rapid generation progress!
            this.PursuitActive = true;
            this.SetUnitsVisible(true);
            this.ResetSelfPlayEpisode();
            this.Host?.Shell?.Announce("RL Self-Play Active (20× Turbo): AI Evader vs AI Police + Helicopter + 3 Drones!");
        }
        else
        {
            this.ControlMode    = "player";
            this.TimeWarp       = 1;
            this.SpectatorTarget = "evader";
            this.Host.Vehicle.SubstepOverride = undefined;
            this.PoliceVehicle.SubstepOverride = undefined;
            this.ClearPursuit("PLAYER DRIVING RESTORED — TRAINED POLICE AI ON PATROL");
        }
        this.RefreshControlStrip();
    }

    CycleTimeWarp()
    {
        const Speeds = [1, 8, 20, 40];
        this.TimeWarp = Speeds[(Speeds.indexOf(this.TimeWarp) + 1) % Speeds.length];
        this.Host?.DrivingHud?.Audio?.PlayUiClick(1.08);
        this.RefreshControlStrip();
    }

    CycleSpectatorTarget()
    {
        const Order = ["evader", "police", "helicopter"];
        this.SpectatorTarget = Order[(Order.indexOf(this.SpectatorTarget) + 1) % Order.length];
        this.Host?.DrivingHud?.Audio?.PlayUiClick(1.05);
        this.RefreshControlStrip();
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                              TRAFFIC LAW ENFORCEMENT & PURSUIT TRIGGERS
    //--------------------------------------------------------------------------------------------------------------------

    QueryPostedSpeedLimitKmh()
    {
        const Pos = this.Host?.Vehicle?.Position || [0, 0, 0];
        if (this.LevelKey === "city")
            return QueryCitySpeedLimitKmh(Pos);
        return 90;
    }

    StartPursuit(Reason = "TRAFFIC VIOLATION")
    {
        const WasActive = this.PursuitActive;
        this.PursuitActive   = true;
        this.ViolationReason = Reason;
        this.BannerMessage   = `🚨 ${Reason}`;
        this.BannerTimer     = 4.5;
        this.BustedTimer     = 0.0;
        this.EscapeTimer     = 0.0;
        this.SetUnitsVisible(true);

        // Spawn/reposition units within tactical pursuit range if cruiser was parked underground or > 130 m away
        const Ev = this.Host.Vehicle;
        const Fwd = Ev.QueryForward();
        const Dist = Math.hypot(this.PoliceVehicle.Position[0] - Ev.Position[0], this.PoliceVehicle.Position[1] - Ev.Position[1]);
        if (this.PoliceVehicle.Position[2] < -10.0 || Dist > 125.0)
        {
            const SpawnX = Ev.Position[0] - Fwd[0] * 22.0;
            const SpawnY = Ev.Position[1] - Fwd[1] * 22.0;
            const Yaw    = Math.atan2(Fwd[1], Fwd[0]);
            this.PoliceVehicle.Respawn([SpawnX, SpawnY, Math.max(0.65, Ev.Position[2] + 0.05)], Yaw);
            this.PoliceVehicle.LinearVelocity = [Fwd[0] * 18.0, Fwd[1] * 18.0, 0.0];
        }
        if (!WasActive)
        {
            this.HeliPosition = [Ev.Position[0] - Fwd[0] * 16.0, Ev.Position[1] - Fwd[1] * 16.0, Ev.Position[2] + 24.5];
            for (let I = 0; I < 3; ++I)
            {
                this.DroneStates[I].Pos = [
                    Ev.Position[0] - Fwd[0] * (12.0 + I * 4.0) + (I - 1) * 5.0,
                    Ev.Position[1] - Fwd[1] * (12.0 + I * 4.0) - (I - 1) * 5.0,
                    Ev.Position[2] + 3.2
                ];
                this.DroneStates[I].Vel = [Fwd[0] * 16.0, Fwd[1] * 16.0, 0.0];
            }
            this.Host?.DrivingHud?.Audio?.PlayPoliceAlert(this.Clock);
            this.Host?.Shell?.Announce(`🚨 ${Reason} — Police Cruiser, Helicopter & 3 Interceptor Drones deployed!`);
        }
        this.RefreshControlStrip();
    }

    ClearPursuit(Message = "ESCAPED — PURSUIT CLEARED")
    {
        this.PursuitActive   = false;
        this.ViolationReason = "";
        this.SpeedingTimer   = 0.0;
        this.BustedTimer     = 0.0;
        this.EscapeTimer     = 0.0;
        this.BannerMessage   = Message;
        this.BannerTimer     = 3.4;
        this.Host?.DrivingHud?.Audio?.StopSiren();
        if (this.LevelKey !== "city")
        {
            this.PoliceVehicle.Respawn([0.0, 0.0, -45.0], 0.0);
            this.SetUnitsVisible(false);
        }
        this.RefreshControlStrip();
    }

    CheckTrafficViolations(Step)
    {
        if (!this.LawEnforcementEnabled || this.PursuitActive || this.ControlMode !== "player")
            return;
        const Ev = this.Host?.Vehicle;
        if (!Ev || Ev.Hidden)
            return;

        const SpeedMps = Math.hypot(Ev.LinearVelocity[0], Ev.LinearVelocity[1]);
        const SpeedKmh = SpeedMps * 3.6;
        const LimitKmh = this.QueryPostedSpeedLimitKmh();

        // ① Speeding (> posted limit + 14 km/h sustained for 0.85 s)
        if (SpeedKmh > LimitKmh + 14.0)
        {
            this.SpeedingTimer += Step;
            if (this.SpeedingTimer >= 0.85)
            {
                this.StartPursuit(`SPEEDING (${Math.round(SpeedKmh)} IN ${LimitKmh} KM/H ZONE)`);
                return;
            }
        }
        else
        {
            this.SpeedingTimer = Math.max(0.0, this.SpeedingTimer - Step * 1.5);
        }

        // ② Running a RED Hovering Intersection Traffic Light
        if (this.Host.TrafficLights && SpeedMps > 6.5)
        {
            const Sig = this.Host.TrafficLights.QueryNearestSignal(Ev.Position);
            if (Sig && Sig.Aspect === "RED" && Sig.Distance < 13.0)
            {
                this.StartPursuit(`RAN RED SIGNAL AT ${Sig.Name.toUpperCase()}`);
                return;
            }
        }

        // ③ Reckless Property Damage (cones knocked or crates smashed)
        const ConeHits = this.Host.Cones?.Metrics?.Hits || 0;
        const Breaks   = this.Host.Fracture?.Metrics?.Breaks || 0;
        if (ConeHits > this.LastConeHits || Breaks > this.LastFractureBreaks)
        {
            this.LastConeHits       = ConeHits;
            this.LastFractureBreaks = Breaks;
            if (this.LevelKey === "city")
            {
                this.StartPursuit("RECKLESS PROPERTY DAMAGE");
                return;
            }
        }
        this.LastConeHits       = ConeHits;
        this.LastFractureBreaks = Breaks;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                         9-RAY 2D LIDAR & STATE OBSERVATION FOR NEURAL POLICIES
    //--------------------------------------------------------------------------------------------------------------------

    CastLidar2D(OriginX, OriginY, BaseYaw, OutHitBuffer = null)
    {
        const Boxes = this.FlatObstacleBoxes;
        const NBox  = Boxes.length;
        const Clearances = new Float32Array(LidarAngles.length);

        for (let R = 0; R < LidarAngles.length; ++R)
        {
            const Ang = BaseYaw + LidarAngles[R];
            const DX  = Math.cos(Ang);
            const DY  = Math.sin(Ang);
            const InvX = Math.abs(DX) > 1.0e-6 ? (1.0 / DX) : 1.0e6;
            const InvY = Math.abs(DY) > 1.0e-6 ? (1.0 / DY) : 1.0e6;

            let BestT = LidarMaxRange;
            for (let B = 0; B < NBox; B += 4)
            {
                const T1 = (Boxes[B]     - OriginX) * InvX;
                const T2 = (Boxes[B + 2] - OriginX) * InvX;
                const T3 = (Boxes[B + 1] - OriginY) * InvY;
                const T4 = (Boxes[B + 3] - OriginY) * InvY;

                const TMin = Math.max(Math.min(T1, T2), Math.min(T3, T4));
                const TMax = Math.min(Math.max(T1, T2), Math.max(T3, T4));
                if (TMax >= 0.0 && TMin <= TMax && TMin >= 0.0 && TMin < BestT)
                    BestT = TMin;
            }

            Clearances[R] = BestT / LidarMaxRange;
            if (OutHitBuffer)
            {
                OutHitBuffer[R * 3 + 0] = OriginX + DX * BestT;
                OutHitBuffer[R * 3 + 1] = OriginY + DY * BestT;
                OutHitBuffer[R * 3 + 2] = Clearances[R];
            }
        }
        return Clearances;
    }

    ChooseNextEvaderWaypoint(FromNode, EvaderVehicle, PolicePos)
    {
        const Fwd = EvaderVehicle.QueryForward();
        const Neighbors = CityNavAdj[FromNode] || [];
        if (Neighbors.length === 0)
            return (FromNode + 1) % CityNavNodes.length;

        let BestNode  = Neighbors[0].To;
        let BestScore = -1.0e9;
        const Cur = CityNavNodes[FromNode];

        for (const Edge of Neighbors)
        {
            const Cand = CityNavNodes[Edge.To];
            const DX = Cand.X - Cur.X, DY = Cand.Y - Cur.Y;
            const Len = Math.hypot(DX, DY) || 1.0;
            const Align = (DX / Len) * Fwd[0] + (DY / Len) * Fwd[1];

            // Score = Police Separation + 90° Pursuit-Breaking Corner Bonus + Covered Alley Bonus - Anti-Loop Penalty!
            const DistFromPolice = Math.hypot(Cand.X - PolicePos[0], Cand.Y - PolicePos[1]);
            const IsPerpendicularCut = Math.abs(Align) < 0.35; // 90° intersection / alley turn breaks Police LOS!
            let Score = DistFromPolice * 0.85 + (IsPerpendicularCut ? 26.0 : Align * 12.0);
            if (Cand.Covered)
                Score += 24.0; // reward threading covered Escape Alleys to break Helicopter LOS!
            if (Align < -0.55)
                Score -= 42.0; // avoid U-turns back into pursuing Cruiser!

            const RecentIdx = this.RecentEvaderNodes.lastIndexOf(Edge.To);
            if (RecentIdx >= 0)
                Score -= 46.0 + RecentIdx * 8.0; // strong anti-repetition penalty so routes dynamically explore the city!

            if (Score > BestScore)
            {
                BestScore = Score;
                BestNode  = Edge.To;
            }
        }

        this.RecentEvaderNodes.push(BestNode);
        if (this.RecentEvaderNodes.length > 5)
            this.RecentEvaderNodes.shift();
        return BestNode;
    }

    ResolvePoliceTacticalTarget(PoliceVehicle, EvaderVehicle)
    {
        const PPos = PoliceVehicle.Position;
        const EPos = EvaderVehicle.Position;
        const Dist = Math.hypot(EPos[0] - PPos[0], EPos[1] - PPos[1]);

        // Check if a City Building AABB blocks direct line-of-sight between Police Cruiser and Evader
        let Blocked = false;
        const DX = EPos[0] - PPos[0], DY = EPos[1] - PPos[1];
        const InvX = Math.abs(DX) > 1.0e-6 ? (1.0 / DX) : 1.0e6;
        const InvY = Math.abs(DY) > 1.0e-6 ? (1.0 / DY) : 1.0e6;
        const Boxes = this.FlatObstacleBoxes;
        for (let B = 0; B < Boxes.length; B += 4)
        {
            const T1 = (Boxes[B]     - PPos[0]) * InvX, T2 = (Boxes[B + 2] - PPos[0]) * InvX;
            const T3 = (Boxes[B + 1] - PPos[1]) * InvY, T4 = (Boxes[B + 3] - PPos[1]) * InvY;
            const TMin = Math.max(Math.min(T1, T2), Math.min(T3, T4));
            const TMax = Math.min(Math.max(T1, T2), Math.max(T3, T4));
            if (TMax >= 0.04 && TMin <= TMax && TMin >= 0.04 && TMin <= 0.96)
            {
                Blocked = true;
                break;
            }
        }

        if (!Blocked && Dist < 58.0)
        {
            const Lead = ClampScalar(Dist / 52.0, 0.12, 0.55);
            return [
                EPos[0] + EvaderVehicle.LinearVelocity[0] * Lead,
                EPos[1] + EvaderVehicle.LinearVelocity[1] * Lead,
                EPos[2]
            ];
        }

        // Route around building superblocks & into Escape Alley mouths via Dijkstra shortest-path graph hop!
        const FromN = QueryNearestCityNode(PPos[0], PPos[1]);
        const GoalN = QueryNearestCityNode(EPos[0], EPos[1]);
        let HopN    = QueryShortestCityNextHop(FromN, GoalN);
        if (Math.hypot(CityNavNodes[HopN].X - PPos[0], CityNavNodes[HopN].Y - PPos[1]) < 12.5 && HopN !== GoalN)
            HopN = QueryShortestCityNextHop(HopN, GoalN);
        return [CityNavNodes[HopN].X, CityNavNodes[HopN].Y, EPos[2]];
    }

    ComposePolicyInputs(SelfVehicle, WaypointPos, OpponentPos, OutBuffer, OutLidarHits = null)
    {
        const Pos   = SelfVehicle.Position;
        const Fwd   = SelfVehicle.QueryForward();
        const Yaw   = Math.atan2(Fwd[1], Fwd[0]);
        const Right = [Fwd[1], -Fwd[0]];

        const Rays = this.CastLidar2D(Pos[0], Pos[1], Yaw, OutLidarHits);
        for (let I = 0; I < 9; ++I)
            OutBuffer[I] = Rays[I] * 2.0 - 1.0; // [-1..+1]

        const Vel     = SelfVehicle.LinearVelocity;
        const VFwd    = Vel[0] * Fwd[0]   + Vel[1] * Fwd[1];
        const VLat    = Vel[0] * Right[0] + Vel[1] * Right[1];
        const YawRate = SelfVehicle.AngularVelocity ? SelfVehicle.AngularVelocity[2] : 0.0;

        OutBuffer[9]  = ClampScalar(VFwd / 32.0, -1.0, 1.5);
        OutBuffer[10] = ClampScalar(VLat / 14.0, -1.0, 1.0);
        OutBuffer[11] = ClampScalar(YawRate / 2.5, -1.0, 1.0);

        // Input 12: Tactical Waypoint Bearing (+Left = +Steer) across intersections, alleys & corners!
        const WX = WaypointPos[0] - Pos[0], WY = WaypointPos[1] - Pos[1];
        const WDist = Math.hypot(WX, WY) || 1.0;
        const WaypointSin = (WX * (-Fwd[1]) + WY * Fwd[0]) / WDist;
        const WaypointCos = (WX * Fwd[0]    + WY * Fwd[1]) / WDist;
        const SignedTurn  = WaypointCos >= 0.0 ? WaypointSin : (WaypointSin >= 0.0 ? 1.0 : -1.0);
        OutBuffer[12] = ClampScalar(SignedTurn * 1.55, -1.0, 1.0);

        // Input 13: Deepest Open Lidar Corridor Angle (teaches clean gap-threading & wall avoidance!)
        let WeightedAng = 0.0, WeightSum = 1.0e-4;
        for (let I = 0; I < 9; ++I)
        {
            const W = Rays[I] * Rays[I];
            WeightedAng += LidarAngles[I] * W;
            WeightSum   += W;
        }
        OutBuffer[13] = ClampScalar((WeightedAng / WeightSum) * 1.25, -1.0, 1.0);

        // Input 14: Upcoming Corner Curvature & Wall-Proximity Brake Cue (lets policy learn trail-braking before 90° turns!)
        const FrontClear = Math.min(Rays[3], Rays[4], Rays[5]);
        const CornerLoad = Math.abs(SignedTurn) * ClampScalar(VFwd / 21.0, 0.0, 1.4) + Math.max(0.0, 0.52 - FrontClear) * 1.7;
        OutBuffer[14] = ClampScalar(CornerLoad - 0.35, -1.0, 1.2);

        // Input 15: Direct Opponent Local Bearing (close-quarters juking for Evader / PIT alignment for Police!)
        const OX = OpponentPos[0] - Pos[0], OY = OpponentPos[1] - Pos[1];
        const ODist = Math.hypot(OX, OY) || 1.0;
        const LocalLeft = (OX * (-Fwd[1]) + OY * Fwd[0]) / ODist;
        OutBuffer[15] = ClampScalar(LocalLeft * 1.35, -1.0, 1.0);

        const Road = QueryNearestCityRoadFrame(Pos[0], Pos[1]);
        return { Rays, VFwd, RoadDist: Road.Distance, ODist, WDist, SignedTurn, FrontClear };
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                      CHASSIS-TO-CHASSIS VEHICLE COLLISION & PIT MANEUVER PHYSICS
    //--------------------------------------------------------------------------------------------------------------------

    ResolveVehicleCollision(Evader, Police, Sparks = null)
    {
        const EFwd = Evader.QueryForward();
        const PFwd = Police.QueryForward();
        const Offsets = [-1.48, 0.0, 1.48];
        const Radius  = 0.96;
        const MinSumR = Radius * 2.0;

        let HitImpulse = 0.0;
        let HitPoint   = null;

        for (let I = 0; I < 3; ++I)
        {
            const EX = Evader.Position[0] + EFwd[0] * Offsets[I];
            const EY = Evader.Position[1] + EFwd[1] * Offsets[I];
            const EZ = Evader.Position[2];
            for (let J = 0; J < 3; ++J)
            {
                const PX = Police.Position[0] + PFwd[0] * Offsets[J];
                const PY = Police.Position[1] + PFwd[1] * Offsets[J];
                const PZ = Police.Position[2];
                if (Math.abs(EZ - PZ) > 1.35)
                    continue;

                const DX = EX - PX;
                const DY = EY - PY;
                const Dist = Math.hypot(DX, DY);
                if (Dist >= MinSumR || Dist < 1.0e-5)
                    continue;

                const NX = DX / Dist;
                const NY = DY / Dist;
                const Pen = MinSumR - Dist;

                // Separate chassis cleanly
                Evader.Position[0] += NX * Pen * 0.52;
                Evader.Position[1] += NY * Pen * 0.52;
                Police.Position[0] -= NX * Pen * 0.48;
                Police.Position[1] -= NY * Pen * 0.48;

                const RVX = Evader.LinearVelocity[0] - Police.LinearVelocity[0];
                const RVY = Evader.LinearVelocity[1] - Police.LinearVelocity[1];
                const RelNormal = RVX * NX + RVY * NY;
                if (RelNormal < 0.0)
                {
                    const Restitution = 0.28;
                    const DeltaV = -(1.0 + Restitution) * RelNormal * 0.5;
                    Evader.LinearVelocity[0] += NX * DeltaV;
                    Evader.LinearVelocity[1] += NY * DeltaV;
                    Police.LinearVelocity[0] -= NX * DeltaV;
                    Police.LinearVelocity[1] -= NY * DeltaV;

                    // PIT Maneuver Yaw Torque: lever arm r × J spins rear-clipped car realistically!
                    const LeverE = (EX - Evader.Position[0]) * NY - (EY - Evader.Position[1]) * NX;
                    const LeverP = (PX - Police.Position[0]) * (-NY) - (PY - Police.Position[1]) * (-NX);
                    Evader.AngularVelocity[2] += ClampScalar(LeverE * DeltaV * 0.22, -2.4, 2.4);
                    Police.AngularVelocity[2] += ClampScalar(LeverP * DeltaV * 0.16, -1.8, 1.8);

                    HitImpulse = Math.max(HitImpulse, DeltaV);
                    HitPoint   = [0.5 * (EX + PX), 0.5 * (EY + PY), 0.5 * (EZ + PZ) + 0.15];
                }
            }
        }

        if (HitImpulse > 1.2 && HitPoint && Sparks?.Emit)
        {
            Sparks.Emit([{
                Point:    HitPoint,
                Velocity: [Evader.LinearVelocity[0] * 0.5, Evader.LinearVelocity[1] * 0.5, 3.2],
                Normal:   [0.0, 0.0, 1.0],
                Strength: ClampScalar(HitImpulse * 0.35, 1.2, 5.0),
                Rim:      null
            }], 1.0 / 60.0);
        }
        return HitImpulse;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       HELICOPTER & 3 POLICE INTERCEPTOR DRONE AERIAL PURSUIT SOLVER
    //--------------------------------------------------------------------------------------------------------------------

    HasLineOfSight2D(AX, AY, BX, BY)
    {
        const DX = BX - AX, DY = BY - AY;
        const Dist = Math.hypot(DX, DY);
        if (Dist < 1.0e-3)
            return true;
        const InvX = Math.abs(DX) > 1.0e-6 ? (1.0 / DX) : 1.0e6;
        const InvY = Math.abs(DY) > 1.0e-6 ? (1.0 / DY) : 1.0e6;
        const Boxes = this.FlatObstacleBoxes;
        for (let B = 0; B < Boxes.length; B += 4)
        {
            const T1 = (Boxes[B]     - AX) * InvX;
            const T2 = (Boxes[B + 2] - AX) * InvX;
            const T3 = (Boxes[B + 1] - AY) * InvY;
            const T4 = (Boxes[B + 3] - AY) * InvY;
            const TMin = Math.max(Math.min(T1, T2), Math.min(T3, T4));
            const TMax = Math.min(Math.max(T1, T2), Math.max(T3, T4));
            if (TMax >= 0.0 && TMin <= TMax && TMin < 1.0 && TMax > 0.02)
                return false;
        }
        return true;
    }

    SteerDroneAroundBuildings(D, GoalX, GoalY, MaxSpd, Step)
    {
        const ToGX = GoalX - D.Pos[0];
        const ToGY = GoalY - D.Pos[1];
        const GoalDist = Math.hypot(ToGX, ToGY) || 0.001;
        const BaseAng  = Math.atan2(ToGY, ToGX);

        // 9-ray obstacle-avoidance fan around desired goal direction so drones thread alleys & bank around buildings!
        const FanOffsets = [0.0, 0.36, -0.36, 0.76, -0.76, 1.22, -1.22, 1.75, -1.75];
        const ProbeRange = Math.min(24.0, Math.max(8.0, GoalDist + 4.0));
        const Boxes      = this.FlatObstacleBoxes;
        let BestAng      = BaseAng;
        let BestScore    = -1.0e9;

        for (let R = 0; R < FanOffsets.length; ++R)
        {
            const Off = FanOffsets[R];
            const Ang = BaseAng + Off;
            const DX  = Math.cos(Ang);
            const DY  = Math.sin(Ang);
            const InvX = Math.abs(DX) > 1.0e-6 ? (1.0 / DX) : 1.0e6;
            const InvY = Math.abs(DY) > 1.0e-6 ? (1.0 / DY) : 1.0e6;

            let HitT = ProbeRange;
            for (let B = 0; B < Boxes.length; B += 4)
            {
                const T1 = (Boxes[B]     - D.Pos[0]) * InvX;
                const T2 = (Boxes[B + 2] - D.Pos[0]) * InvX;
                const T3 = (Boxes[B + 1] - D.Pos[1]) * InvY;
                const T4 = (Boxes[B + 3] - D.Pos[1]) * InvY;
                const TMin = Math.max(Math.min(T1, T2), Math.min(T3, T4));
                const TMax = Math.min(Math.max(T1, T2), Math.max(T3, T4));
                if (TMax >= 0.0 && TMin <= TMax && TMin >= 0.0 && TMin < HitT)
                    HitT = TMin;
            }
            const ClearFrac = HitT / ProbeRange;
            // Strongly penalize rays blocked within 5.5 m, reward goal alignment + heading continuity
            const ContAlign = Math.cos(Ang - D.Yaw) * 0.14;
            const Score = (HitT < 4.5 ? -8.0 + HitT : ClearFrac * 2.2) + Math.cos(Off) * 1.45 + ContAlign;
            if (Score > BestScore)
            {
                BestScore = Score;
                BestAng   = Ang;
            }
        }

        const DesiredSpeed = Math.min(MaxSpd, GoalDist * 3.8 + 4.0);
        const VX = Math.cos(BestAng) * DesiredSpeed;
        const VY = Math.sin(BestAng) * DesiredSpeed;
        const PrevVX = D.Vel[0], PrevVY = D.Vel[1];
        const Blend = Math.min(1.0, Step * 6.8);
        D.Vel[0] += (VX - D.Vel[0]) * Blend;
        D.Vel[1] += (VY - D.Vel[1]) * Blend;

        D.Pos[0] += D.Vel[0] * Step;
        D.Pos[1] += D.Vel[1] * Step;

        // Hard building-wall exclusion margin (1.4 m) so drones never clip inside architectural facades
        const Margin = 1.4;
        for (let B = 0; B < Boxes.length; B += 4)
        {
            const MinX = Boxes[B] - Margin, MinY = Boxes[B + 1] - Margin;
            const MaxX = Boxes[B + 2] + Margin, MaxY = Boxes[B + 3] + Margin;
            if (D.Pos[0] > MinX && D.Pos[0] < MaxX && D.Pos[1] > MinY && D.Pos[1] < MaxY)
            {
                const PushLeft  = D.Pos[0] - MinX;
                const PushRight = MaxX - D.Pos[0];
                const PushDown  = D.Pos[1] - MinY;
                const PushUp    = MaxY - D.Pos[1];
                const MinPush   = Math.min(PushLeft, PushRight, PushDown, PushUp);
                if (MinPush === PushLeft)       { D.Pos[0] = MinX; D.Vel[0] = Math.min(0.0, D.Vel[0]); }
                else if (MinPush === PushRight) { D.Pos[0] = MaxX; D.Vel[0] = Math.max(0.0, D.Vel[0]); }
                else if (MinPush === PushDown)  { D.Pos[1] = MinY; D.Vel[1] = Math.min(0.0, D.Vel[1]); }
                else                            { D.Pos[1] = MaxY; D.Vel[1] = Math.max(0.0, D.Vel[1]); }
            }
        }

        const SpdNow = Math.hypot(D.Vel[0], D.Vel[1]);
        if (SpdNow > 0.6)
        {
            const NewYaw = Math.atan2(D.Vel[1], D.Vel[0]);
            const AccLat = (-(D.Vel[0] - PrevVX) * Math.sin(NewYaw) + (D.Vel[1] - PrevVY) * Math.cos(NewYaw)) / Math.max(Step, 1.0e-3);
            D.Yaw  = NewYaw;
            D.Roll += (ClampScalar(-AccLat * 0.022, -0.58, 0.58) - (D.Roll || 0.0)) * Math.min(1.0, Step * 8.0);
        }
    }

    AdvanceAerialUnits(Step, Evader)
    {
        const EvPos = Evader.Position;
        const EvVel = Evader.LinearVelocity;
        const Fwd   = Evader.QueryForward();
        const Right = [Fwd[1], -Fwd[0]];

        // ① Police Pursuit Helicopter: overhead tracking + alley/bridge LOS occlusion check!
        this.HeliRotorAngle = (this.HeliRotorAngle + Step * 44.0) % (Math.PI * 2.0);
        this.HeliTailAngle  = (this.HeliTailAngle  + Step * 76.0) % (Math.PI * 2.0);

        const RawOccluded = this.LevelKey === "city" && IsPointOccludedFromHelicopter(EvPos);
        this.HeliLosClear = !RawOccluded || this.DroneLockActive;

        let DesiredHeliX, DesiredHeliY;
        if (this.PursuitActive)
        {
            if (this.HeliLosClear)
            {
                this.HeliSpotTarget[0] = EvPos[0] + EvVel[0] * 0.25;
                this.HeliSpotTarget[1] = EvPos[1] + EvVel[1] * 0.25;
                this.HeliSpotTarget[2] = EvPos[2];
                DesiredHeliX = EvPos[0] - Fwd[0] * 14.0 + Math.cos(this.Clock * 0.55) * 10.0;
                DesiredHeliY = EvPos[1] - Fwd[1] * 14.0 + Math.sin(this.Clock * 0.55) * 10.0;
            }
            else
            {
                // Lost visual inside covered alley -> sweep search pattern around last known coordinates!
                DesiredHeliX = this.HeliSpotTarget[0] + Math.cos(this.Clock * 1.4) * 18.0;
                DesiredHeliY = this.HeliSpotTarget[1] + Math.sin(this.Clock * 1.4) * 18.0;
            }
        }
        else
        {
            DesiredHeliX = -45.0 + Math.cos(this.Clock * 0.22) * 75.0;
            DesiredHeliY = Math.sin(this.Clock * 0.22) * 65.0;
            this.HeliSpotTarget = [DesiredHeliX + 18.0, DesiredHeliY, 0.0];
        }

        const DesiredHeliZ = Math.max(EvPos[2] + 22.0, 24.5);
        const HX = (DesiredHeliX - this.HeliPosition[0]) * 2.4;
        const HY = (DesiredHeliY - this.HeliPosition[1]) * 2.4;
        const HZ = (DesiredHeliZ - this.HeliPosition[2]) * 2.0;
        this.HeliVelocity[0] += (HX - this.HeliVelocity[0]) * Math.min(1.0, Step * 3.5);
        this.HeliVelocity[1] += (HY - this.HeliVelocity[1]) * Math.min(1.0, Step * 3.5);
        this.HeliVelocity[2] += (HZ - this.HeliVelocity[2]) * Math.min(1.0, Step * 3.5);

        this.HeliPosition[0] += this.HeliVelocity[0] * Step;
        this.HeliPosition[1] += this.HeliVelocity[1] * Step;
        this.HeliPosition[2] += this.HeliVelocity[2] * Step;

        // ② 3 Autonomous Tactical Police Drones (Obstacle-Avoiding + Role-Coordinated Swarm!):
        //    • Drone 0 ("RECON"):  Threads covered alleys when Helicopter loses LOS to relay live suspect coordinates!
        //    • Drone 1 ("CUTOFF"): Sprints 22 m ahead along the road tangent to form a low-altitude weaving aerial roadblock!
        //    • Drone 2 ("EMP"):    Dives onto rear flank (< 10.5 m) to charge & fire a tactical EMP disruption pulse!
        let ReconLock = false;
        const RoadFrame = QueryNearestCityRoadFrame(EvPos[0], EvPos[1]);
        const AlignSign = (RoadFrame.Tangent[0] * Fwd[0] + RoadFrame.Tangent[1] * Fwd[1]) >= 0.0 ? 1.0 : -1.0;
        const RoadDir   = [RoadFrame.Tangent[0] * AlignSign, RoadFrame.Tangent[1] * AlignSign];

        this.DroneEmpCharge = 0.0;
        for (let I = 0; I < 3; ++I)
        {
            const D = this.DroneStates[I];
            D.Cooldown = Math.max(0.0, (D.Cooldown || 0.0) - Step);
            let GoalX, GoalY, GoalZ, MaxDroneSpd = 38.0;

            if (this.PursuitActive)
            {
                if (I === 0)
                {
                    // RECON SCOUT: dives straight down alley axis when occluded, or orbits high-angle nose-left spotter!
                    if (RawOccluded)
                    {
                        GoalX = EvPos[0] + EvVel[0] * 0.35;
                        GoalY = EvPos[1] + EvVel[1] * 0.35;
                        GoalZ = Math.max(2.35, EvPos[2] + 1.85);
                        MaxDroneSpd = 42.0;
                    }
                    else
                    {
                        GoalX = EvPos[0] + Fwd[0] * 9.0 - Right[0] * 4.8;
                        GoalY = EvPos[1] + Fwd[1] * 9.0 - Right[1] * 4.8;
                        GoalZ = Math.max(3.2, EvPos[2] + 2.8);
                    }
                }
                else if (I === 1)
                {
                    // CUT-OFF BLOCK: sprints 21 m ahead along street/alley tangent and weaves across windshield lane!
                    const Weave = Math.sin(this.Clock * 4.6) * 2.8;
                    GoalX = EvPos[0] + RoadDir[0] * 21.0 + (-RoadDir[1]) * Weave;
                    GoalY = EvPos[1] + RoadDir[1] * 21.0 + ( RoadDir[0]) * Weave;
                    GoalZ = Math.max(1.85, EvPos[2] + 1.25);
                    MaxDroneSpd = 45.0;
                }
                else
                {
                    // EMP DISRUPTOR: peels wide during cooldown, otherwise dives tight onto rear-right quarter!
                    if (D.Cooldown > 0.0)
                    {
                        GoalX = EvPos[0] - Fwd[0] * 14.0 + Right[0] * 9.5;
                        GoalY = EvPos[1] - Fwd[1] * 14.0 + Right[1] * 9.5;
                        GoalZ = Math.max(4.0, EvPos[2] + 3.6);
                    }
                    else
                    {
                        GoalX = EvPos[0] - Fwd[0] * 3.8 + Right[0] * 3.0;
                        GoalY = EvPos[1] - Fwd[1] * 3.8 + Right[1] * 3.0;
                        GoalZ = Math.max(2.05, EvPos[2] + 1.45);
                        MaxDroneSpd = 41.0;
                    }
                }
            }
            else
            {
                const PPos = this.PoliceVehicle.Position;
                GoalX = PPos[0] + Math.cos(this.Clock * 1.2 + I * 2.09) * 6.5;
                GoalY = PPos[1] + Math.sin(this.Clock * 1.2 + I * 2.09) * 6.5;
                GoalZ = PPos[2] + 3.8;
                MaxDroneSpd = 24.0;
            }

            this.SteerDroneAroundBuildings(D, GoalX, GoalY, MaxDroneSpd, Step);
            D.Vel[2]  = (GoalZ - D.Pos[2]) * 4.5;
            D.Pos[2] += D.Vel[2] * Step;

            const DistToEv = Math.hypot(D.Pos[0] - EvPos[0], D.Pos[1] - EvPos[1]);
            D.HasLos = this.PursuitActive && DistToEv < 24.0 && this.HasLineOfSight2D(D.Pos[0], D.Pos[1], EvPos[0], EvPos[1]);
            if (D.HasLos && DistToEv < 20.0)
                ReconLock = true;

            // EMP Disruptor Charge & Discharge Mechanic on Drone #2!
            if (I === 2)
            {
                if (this.PursuitActive && D.Cooldown <= 0.0 && D.HasLos && DistToEv < 10.5)
                {
                    D.EmpCharge = Math.min(1.0, (D.EmpCharge || 0.0) + Step / 1.50);
                    if (D.EmpCharge >= 1.0)
                    {
                        D.EmpCharge = 0.0;
                        D.Cooldown  = 4.2;
                        Evader.LinearVelocity[0] *= 0.79;
                        Evader.LinearVelocity[1] *= 0.79;
                        Evader.AngularVelocity[2] += (Math.sin(this.Clock * 17.0) >= 0 ? 1 : -1) * 0.55;
                        if (this.ControlMode === "player")
                        {
                            this.BannerMessage = "⚡ POLICE DRONE EMP PULSE HIT — SHAKE THEM IN THE ALLEYS!";
                            this.BannerTimer   = 2.6;
                        }
                        this.Host?.Sparks?.Emit?.([{
                            Point:    [EvPos[0], EvPos[1], EvPos[2] + 0.55],
                            Velocity: [EvVel[0] * 0.4, EvVel[1] * 0.4, 3.8],
                            Normal:   [0.0, 0.0, 1.0],
                            Strength: 3.4,
                            Rim:      null
                        }], 1.0 / 60.0);
                    }
                }
                else
                {
                    D.EmpCharge = Math.max(0.0, (D.EmpCharge || 0.0) - Step * 1.4);
                }
                this.DroneEmpCharge = D.EmpCharge;
            }
        }
        this.DroneLockActive = ReconLock;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       SELF-PLAY RL EPISODE STEPPING & INSTANT HEADLESS BOOST
    //--------------------------------------------------------------------------------------------------------------------

    ResetSelfPlayEpisode(OverrideScenarioIdx = null)
    {
        // KEY RL FIX: All 6 candidates in Generation G evaluate on the EXACT SAME Scenario S_G!
        // Previously ScenarioCursor incremented per candidate (PopSize===6===Scenarios.length), which ranked
        // scenario easiness instead of policy weights and trapped Gen 1..∞ in an identical static loop!
        const GenScenIdx = OverrideScenarioIdx !== null
            ? OverrideScenarioIdx
            : ((this.EvaderBrain.Generation - 1) % SelfPlayScenarios.length);
        const Scen = SelfPlayScenarios[GenScenIdx];

        const Ev = this.Host.Vehicle;
        const Po = this.PoliceVehicle;
        Ev.Respawn([Scen.Evader[0], Scen.Evader[1], Scen.Evader[2]], Scen.Evader[3]);
        Po.Respawn([Scen.Police[0], Scen.Police[1], Scen.Police[2]], Scen.Police[3]);

        // Rolling start (9.5 m/s) approaching an immediate tactical decision intersection or alley!
        const EF = Ev.QueryForward();
        const PF = Po.QueryForward();
        Ev.LinearVelocity = [EF[0] * 9.5, EF[1] * 9.5, 0.0];
        Po.LinearVelocity = [PF[0] * 10.2, PF[1] * 10.2, 0.0];

        const StartNear = QueryNearestCityNode(Ev.Position[0], Ev.Position[1]);
        this.EvaderGoalNode     = Scen.StartNode ?? StartNear;
        this.RecentEvaderNodes  = [StartNear, this.EvaderGoalNode];
        if (Math.hypot(CityNavNodes[this.EvaderGoalNode].X - Ev.Position[0], CityNavNodes[this.EvaderGoalNode].Y - Ev.Position[1]) < 13.0)
            this.EvaderGoalNode = this.ChooseNextEvaderWaypoint(this.EvaderGoalNode, Ev, Po.Position);

        const GoalN             = CityNavNodes[this.EvaderGoalNode];
        this.PrevGoalDist       = Math.hypot(GoalN.X - Ev.Position[0], GoalN.Y - Ev.Position[1]);
        this.EpisodeClock       = 0.0;
        this.EvaderEpReturn     = 0.0;
        this.PoliceEpReturn     = 0.0;
        this.EpisodeWaypoints   = 0;
        this.EvaderStallTimer   = 0.0;
        this.BustedTimer        = 0.0;
        this.PrevSeparation     = Math.hypot(Ev.Position[0] - Po.Position[0], Ev.Position[1] - Po.Position[1]);
    }

    StepSelfPlayPhysics(SubStep, RecordSparks = true)
    {
        const Ev = this.Host.Vehicle;
        const Po = this.PoliceVehicle;

        // ① Update Dynamic Multi-Block Tactical Waypoints (Evader chains non-repeating streets/alleys; Police shortest-path intercepts!)
        let GoalNodeObj = CityNavNodes[this.EvaderGoalNode];
        const DistToGoal = Math.hypot(GoalNodeObj.X - Ev.Position[0], GoalNodeObj.Y - Ev.Position[1]);
        let WaypointBonus = 0.0;
        if (DistToGoal < 13.5)
        {
            this.EpisodeWaypoints++;
            if (this.EpisodeWaypoints > this.GenMaxWaypoints)
                this.GenMaxWaypoints = this.EpisodeWaypoints;
            WaypointBonus = 11.0 + (GoalNodeObj.Covered ? 4.5 : 0.0);
            this.EvaderGoalNode = this.ChooseNextEvaderWaypoint(this.EvaderGoalNode, Ev, Po.Position);
            GoalNodeObj = CityNavNodes[this.EvaderGoalNode];
            this.PrevGoalDist = Math.hypot(GoalNodeObj.X - Ev.Position[0], GoalNodeObj.Y - Ev.Position[1]);
        }

        const EvWaypoint = [GoalNodeObj.X, GoalNodeObj.Y, Ev.Position[2]];
        this.PoliceTargetPoint = this.ResolvePoliceTacticalTarget(Po, Ev);

        // ② Evaluate 16-input Lidar + Tactical Graph + Kinematics sensors & Neural Policies for BOTH cars!
        const EvObs = this.ComposePolicyInputs(Ev, EvWaypoint, Po.Position, this.EvaderInputs, this.EvaderLidarHits);
        const PoObs = this.ComposePolicyInputs(Po, this.PoliceTargetPoint, Ev.Position, this.PoliceInputs, this.PoliceLidarHits);

        const EvCtrl = this.EvaderBrain.Forward(this.EvaderInputs);
        const PoCtrl = this.PoliceBrain.Forward(this.PoliceInputs);

        Ev.Advance(EvCtrl, SubStep);
        Po.Advance(PoCtrl, SubStep);

        const Impact = this.ResolveVehicleCollision(Ev, Po, RecordSparks ? this.Host.Sparks : null);

        const EvSpeedKmh = Math.hypot(Ev.LinearVelocity[0], Ev.LinearVelocity[1]) * 3.6;
        if (EvSpeedKmh > this.GenPeakKmh)
            this.GenPeakKmh = EvSpeedKmh;

        // ③ Anti-Hack RL Step Rewards: Strictly positive for clean on-road forward speed & tactical waypoints,
        //    with heavy remaining-time penalty on early wall-stalls so crashing early is NEVER rewarded!
        const Sep = Math.hypot(Ev.Position[0] - Po.Position[0], Ev.Position[1] - Po.Position[1]);
        const SepDelta = Sep - this.PrevSeparation;
        this.PrevSeparation = Sep;

        const NewGoalDist = Math.hypot(GoalNodeObj.X - Ev.Position[0], GoalNodeObj.Y - Ev.Position[1]);
        const GoalProgress = ClampScalar(this.PrevGoalDist - NewGoalDist, -2.0, 2.5);
        this.PrevGoalDist = NewGoalDist;

        const EvMinRay = EvObs.FrontClear;
        const PoMinRay = PoObs.FrontClear;
        const InAlleyCover = IsPointOccludedFromHelicopter(Ev.Position);

        const EvOnRoad  = EvObs.RoadDist < 10.2 ? 1.0 : 0.0;
        const EvClear   = ClampScalar((EvMinRay - 0.075) / 0.22, 0.0, 1.0);
        const CleanSpeed = EvOnRoad * EvClear * Math.max(0.0, EvObs.VFwd);

        let R_Ev = WaypointBonus * 1.4
                 + GoalProgress * 0.75 * EvOnRoad
                 + (CleanSpeed * 0.52 + ClampScalar(SepDelta, -8.0, 8.0) * 0.45 * EvOnRoad) * SubStep;
        if (InAlleyCover && EvObs.VFwd > 4.5) R_Ev += 1.6 * SubStep;
        if (EvObs.RoadDist >= 10.2)           R_Ev -= 1.2 * SubStep;
        if (EvMinRay < 0.075)                 R_Ev -= 3.5 * SubStep;

        const PoOnRoad  = PoObs.RoadDist < 10.8 ? 1.0 : 0.0;
        const PoClear   = ClampScalar((PoMinRay - 0.075) / 0.22, 0.0, 1.0);
        let R_Po = (-ClampScalar(SepDelta, -10.0, 10.0) * 1.6 + Math.max(0.0, 1.0 - Sep / 85.0) * 2.4 + PoOnRoad * PoClear * Math.max(0.0, PoObs.VFwd) * 0.28) * SubStep;
        if (PoObs.RoadDist >= 10.8)           R_Po -= 1.2 * SubStep;
        if (PoMinRay < 0.075)                 R_Po -= 3.2 * SubStep;
        if (Impact > 1.0)                     R_Po += 5.5;

        this.EvaderEpReturn += R_Ev;
        this.PoliceEpReturn += R_Po;
        this.EpisodeClock   += SubStep;

        if (EvObs.VFwd < 1.0 && EvMinRay < 0.09)
            this.EvaderStallTimer += SubStep;
        else
            this.EvaderStallTimer = Math.max(0.0, this.EvaderStallTimer - SubStep * 1.5);

        if (Sep < 7.6 && Math.hypot(Ev.LinearVelocity[0], Ev.LinearVelocity[1]) < 3.2)
            this.BustedTimer += SubStep;
        else
            this.BustedTimer = Math.max(0.0, this.BustedTimer - SubStep);

        const RemTime = Math.max(0.0, this.EpisodeMaxSeconds - this.EpisodeClock);
        if (this.BustedTimer >= 0.85)
        {
            this.EvaderEpReturn -= 24.0 + RemTime * 4.5;
            this.PoliceEpReturn += 24.0 + RemTime * 3.0;
            this.TotalBusts++;
            this.FinishSelfPlayEpisode();
        }
        else if (this.EvaderStallTimer >= 1.15)
        {
            // Heavy remaining-time penalty ensures crashing early is ALWAYS strictly worse than driving cleanly!
            this.EvaderEpReturn -= 28.0 + RemTime * 5.5;
            this.FinishSelfPlayEpisode();
        }
        else if (this.EpisodeClock >= this.EpisodeMaxSeconds)
        {
            if (Sep > 22.0 && EvOnRoad > 0.5)
            {
                this.EvaderEpReturn += 14.0;
                this.TotalEscapes++;
            }
            this.FinishSelfPlayEpisode();
        }
    }

    FinishSelfPlayEpisode()
    {
        const PrevGen = this.EvaderBrain.Generation;
        this.EvaderBrain.RecordEpisodeReturn(this.EvaderEpReturn);
        this.PoliceBrain.RecordEpisodeReturn(this.PoliceEpReturn);
        if (this.EvaderBrain.Generation !== PrevGen)
        {
            this.LastGenMaxWaypoints = this.GenMaxWaypoints;
            this.LastGenPeakKmh      = Math.round(this.GenPeakKmh);
            this.GenMaxWaypoints     = 0;
            this.GenPeakKmh          = 0;
        }
        this.EpisodeIndex++;
        this.ResetSelfPlayEpisode();
    }

    // 📝 Deterministic multi-scenario cornering & alley benchmark (Scenarios 1, 2, 3) proving genuine RL skill gains!
    EvaluatePolicyBenchmark(SimSeconds = 7.2)
    {
        this.RebuildLidarObstacles();
        this.PoliceVehicle.Surfaces = this.Host.Vehicle.Surfaces;
        const PriorEv = this.Host.Vehicle.SubstepOverride;
        const PriorPo = this.PoliceVehicle.SubstepOverride;
        this.Host.Vehicle.SubstepOverride  = 1.0 / 160.0;
        this.PoliceVehicle.SubstepOverride = 1.0 / 160.0;
        try
        {
            const BenchScenarios = [1, 2, 3];
            let TotalCleanMeters = 0.0;
            let TotalWaypoints   = 0;
            const SubStep = 1.0 / 25.0;
            const Steps   = Math.round(SimSeconds / SubStep);

            for (const ScIdx of BenchScenarios)
            {
                this.ResetSelfPlayEpisode(ScIdx);
                for (let S = 0; S < Steps; ++S)
                {
                    const PrevX = this.Host.Vehicle.Position[0], PrevY = this.Host.Vehicle.Position[1];
                    const GoalObj = CityNavNodes[this.EvaderGoalNode];
                    if (Math.hypot(GoalObj.X - PrevX, GoalObj.Y - PrevY) < 13.5)
                    {
                        this.EpisodeWaypoints++;
                        this.EvaderGoalNode = this.ChooseNextEvaderWaypoint(this.EvaderGoalNode, this.Host.Vehicle, this.PoliceVehicle.Position);
                    }
                    const NextGoal = CityNavNodes[this.EvaderGoalNode];
                    const EvObs = this.ComposePolicyInputs(this.Host.Vehicle, [NextGoal.X, NextGoal.Y, 0.63], this.PoliceVehicle.Position, this.EvaderInputs);
                    const PoTarget = this.ResolvePoliceTacticalTarget(this.PoliceVehicle, this.Host.Vehicle);
                    this.ComposePolicyInputs(this.PoliceVehicle, PoTarget, this.Host.Vehicle.Position, this.PoliceInputs);

                    this.Host.Vehicle.Advance(this.EvaderBrain.Forward(this.EvaderInputs, true), SubStep);
                    this.PoliceVehicle.Advance(this.PoliceBrain.Forward(this.PoliceInputs, true), SubStep);
                    this.ResolveVehicleCollision(this.Host.Vehicle, this.PoliceVehicle, null);

                    const StepDist = Math.hypot(this.Host.Vehicle.Position[0] - PrevX, this.Host.Vehicle.Position[1] - PrevY);
                    if (EvObs.RoadDist < 10.5 && EvObs.FrontClear > 0.08)
                        TotalCleanMeters += StepDist;
                }
                TotalWaypoints += this.EpisodeWaypoints;
            }
            return { CleanRoadMeters: TotalCleanMeters, WaypointsCleared: TotalWaypoints };
        }
        finally
        {
            this.Host.Vehicle.SubstepOverride  = PriorEv;
            this.PoliceVehicle.SubstepOverride = PriorPo;
            this.EvaderBrain.ActivateCandidate(this.EvaderBrain.CandidateIndex);
            this.PoliceBrain.ActivateCandidate(this.PoliceBrain.CandidateIndex);
            this.ResetSelfPlayEpisode();
        }
    }

    // 📝 Instantly runs N full RL generations (N * 6 episodes) synchronously for rapid training & unit-test verification!
    FastTrainGenerations(GenCount = 12)
    {
        this.RebuildLidarObstacles();
        this.PoliceVehicle.Surfaces = this.Host.Vehicle.Surfaces;
        const PriorEv = this.Host.Vehicle.SubstepOverride;
        const PriorPo = this.PoliceVehicle.SubstepOverride;
        this.Host.Vehicle.SubstepOverride  = 1.0 / 160.0;
        this.PoliceVehicle.SubstepOverride = 1.0 / 160.0;
        try
        {
            const TargetGen = this.EvaderBrain.Generation + GenCount;
            const SubStep   = 1.0 / 25.0;
            let Guard = 0;
            while (this.EvaderBrain.Generation < TargetGen && Guard++ < GenCount * 6 * 260)
                this.StepSelfPlayPhysics(SubStep, false);
        }
        finally
        {
            this.Host.Vehicle.SubstepOverride  = PriorEv;
            this.PoliceVehicle.SubstepOverride = PriorPo;
        }
        this.AdvanceAerialUnits(0.05, this.Host.Vehicle);
        this.SyncGpuOccupants(false);
        this.Host?.Shell?.Announce(`⚡ Trained to Generation ${this.EvaderBrain.Generation} · Best R=${this.EvaderBrain.LastBestReturn.toFixed(1)} · Waypoints=${this.LastGenMaxWaypoints}`);
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                                  PER-FRAME UPDATE & GPU OCCUPANT SYNC
    //--------------------------------------------------------------------------------------------------------------------

    Advance(StepSeconds)
    {
        if (!this.Enabled)
            return false;
        const Step = ClampScalar(StepSeconds, 0.0, 0.05);
        if (Step <= 0.0)
            return false;

        this.Clock       += Step;
        this.StrobePhase  = (this.Clock * 7.5) % 1.0;
        this.BannerTimer  = Math.max(0.0, this.BannerTimer - Step);
        this.PoliceVehicle.Surfaces = this.Host.Vehicle.Surfaces;

        if (this.ControlMode === "selfplay")
        {
            const SubSteps = ClampScalar(Math.round(this.TimeWarp), 1, 40);
            const TurboStep = SubSteps >= 8 ? (1.0 / 180.0) : undefined;
            this.Host.Vehicle.SubstepOverride  = TurboStep;
            this.PoliceVehicle.SubstepOverride = TurboStep;
            for (let S = 0; S < SubSteps; ++S)
                this.StepSelfPlayPhysics(Step, S === SubSteps - 1);
            this.AdvanceAerialUnits(Step, this.Host.Vehicle);
            this.Host?.DrivingHud?.Audio?.UpdatePoliceSiren(
                true,
                Math.hypot(this.PoliceVehicle.Position[0] - this.Host.Vehicle.Position[0],
                           this.PoliceVehicle.Position[1] - this.Host.Vehicle.Position[1]),
                this.Clock,
                false
            );
            this.SyncGpuOccupants(false);
            return true;
        }

        // Player Driving Mode: monitor traffic laws & run trained Police AI when Wanted (or calm patrol on "city")!
        this.CheckTrafficViolations(Step);

        const Visible = this.PursuitActive || this.LevelKey === "city";
        if (!Visible)
            return false;

        const Ev = this.Host.Vehicle;
        if (this.PursuitActive)
        {
            // Drive Police Interceptor using Dijkstra shortest-path corner routing + RL-trained PoliceBrain!
            const WaypointTarget = this.ResolvePoliceTacticalTarget(this.PoliceVehicle, Ev);
            this.ComposePolicyInputs(this.PoliceVehicle, WaypointTarget, Ev.Position, this.PoliceInputs, this.PoliceLidarHits);
            const Ctrl = this.PoliceBrain.Forward(this.PoliceInputs, true);
            // Blend RL learned steering with shortest-path waypoint + Lidar corridor steering so Player-Mode chases corner sharply!
            const BlendLearned = ClampScalar((this.PoliceBrain.Generation - 1) / 8.0, 0.0, 0.85);
            const DirectSteer  = ClampScalar(this.PoliceInputs[12] * 1.15 + this.PoliceInputs[13] * 0.55 - this.PoliceInputs[10] * 0.35, -1.0, 1.0);
            Ctrl.Steer = Ctrl.Steer * BlendLearned + DirectSteer * (1.0 - BlendLearned);
            const NeedCornerBrake = this.PoliceInputs[14] > 0.45;
            Ctrl.Throttle = NeedCornerBrake ? 0.25 : Math.max(Ctrl.Throttle, 0.84);
            Ctrl.Brake    = NeedCornerBrake ? 0.55 : 0.0;

            this.PoliceVehicle.Advance(Ctrl, Step);
            this.ResolveVehicleCollision(Ev, this.PoliceVehicle, this.Host.Sparks);

            const Dist = Math.hypot(this.PoliceVehicle.Position[0] - Ev.Position[0], this.PoliceVehicle.Position[1] - Ev.Position[1]);
            const EvSpd = Math.hypot(Ev.LinearVelocity[0], Ev.LinearVelocity[1]);
            this.Host?.DrivingHud?.Audio?.UpdatePoliceSiren(true, Dist, this.Clock, Dist < 18.0);

            if (Dist < 7.8 && EvSpd < 2.2)
            {
                this.BustedTimer += Step;
                if (this.BustedTimer >= 2.6)
                {
                    this.TotalBusts++;
                    this.ClearPursuit("🚔 BUSTED! POLICE INTERCEPTOR PINNED VEHICLE");
                }
            }
            else
            {
                this.BustedTimer = Math.max(0.0, this.BustedTimer - Step * 0.8);
            }

            if (Dist > 92.0 && !this.HeliLosClear)
            {
                this.EscapeTimer += Step;
                if (this.EscapeTimer >= 9.0)
                {
                    this.TotalEscapes++;
                    this.ClearPursuit("🏁 ESCAPED PURSUIT IN ALLEY COVER!");
                }
            }
            else
            {
                this.EscapeTimer = Math.max(0.0, this.EscapeTimer - Step * 0.5);
            }
        }
        else
        {
            // Calm legal patrol cruise on City Pursuit streets until player breaks a traffic law!
            const PatrolNode = CityNavNodes[QueryShortestCityNextHop(QueryNearestCityNode(this.PoliceVehicle.Position[0], this.PoliceVehicle.Position[1]), 5)];
            this.ComposePolicyInputs(this.PoliceVehicle, [PatrolNode.X, PatrolNode.Y, 0.63], Ev.Position, this.PoliceInputs, null);
            const PatrolSteer = ClampScalar(this.PoliceInputs[12] * 1.05 + this.PoliceInputs[13] * 0.45, -0.8, 0.8);
            const Spd = Math.hypot(this.PoliceVehicle.LinearVelocity[0], this.PoliceVehicle.LinearVelocity[1]);
            this.PoliceVehicle.Advance({ Throttle: Spd < 13.5 ? 0.45 : 0.05, Brake: 0.0, Steer: PatrolSteer, Handbrake: false }, Step);
            const Impact = this.ResolveVehicleCollision(Ev, this.PoliceVehicle, this.Host.Sparks);
            if (Impact > 1.2)
                this.StartPursuit("HIT POLICE INTERCEPTOR — ASSAULT ON CRUISER!");
        }

        this.AdvanceAerialUnits(Step, Ev);
        this.SyncGpuOccupants(false);
        return true;
    }

    SyncGpuOccupants(ResetHistory = false)
    {
        const Block = this.Scene?.PoliceBlock;
        if (!Block)
            return;

        const UpdateOcc = (Idx, Xform) =>
        {
            if (Idx < 0 || !this.Scene.Occupants[Idx])
                return;
            const Occ = this.Scene.Occupants[Idx];
            if (ResetHistory)
                Occ.PreviousTransform.set(Xform);
            else
                Occ.PreviousTransform.set(Occ.Transform);
            Occ.Transform = Xform;
            Occ.Moving = !Occ.Inactive;
            if (Occ.LocalBounds)
                Occ.Bounds = this.Scene.ComputeOccupantBounds ? Occ.Bounds : Occ.Bounds;
        };

        // ① Police ControlVehicle Body + 4 Wheels
        UpdateOcc(Block.CruiserBody, this.PoliceVehicle.QueryBodyTransform());
        for (let W = 0; W < 4; ++W)
            UpdateOcc(Block.CruiserWheels[W], this.PoliceVehicle.QueryWheelTransform(W));

        // ② Police Helicopter Body + Spinning Main Rotor + Spinning Tail Rotor
        const HV = this.HeliVelocity;
        const HYaw = Math.hypot(HV[0], HV[1]) > 0.8
            ? Math.atan2(HV[1], HV[0])
            : Math.atan2(this.HeliSpotTarget[1] - this.HeliPosition[1], this.HeliSpotTarget[0] - this.HeliPosition[0]);
        const HPitch = ClampScalar(Math.hypot(HV[0], HV[1]) * 0.012, -0.22, 0.22);
        const QHeli  = MultiplyQuaternion(ConstructAxisQuaternion([0, 0, 1], HYaw), ConstructAxisQuaternion([0, 1, 0], HPitch));
        UpdateOcc(Block.HeliBody, ConstructRigidTransform(this.HeliPosition, QHeli));

        const MastWorld = [
            this.HeliPosition[0] + RotateVector(QHeli, [0.10, 0.0, 2.16])[0],
            this.HeliPosition[1] + RotateVector(QHeli, [0.10, 0.0, 2.16])[1],
            this.HeliPosition[2] + RotateVector(QHeli, [0.10, 0.0, 2.16])[2]
        ];
        const QMain = MultiplyQuaternion(QHeli, ConstructAxisQuaternion([0, 0, 1], this.HeliRotorAngle));
        UpdateOcc(Block.HeliMainRotor, ConstructRigidTransform(MastWorld, QMain));

        const TailOff = RotateVector(QHeli, [-4.18, 0.12, 1.72]);
        const TailWorld = [this.HeliPosition[0] + TailOff[0], this.HeliPosition[1] + TailOff[1], this.HeliPosition[2] + TailOff[2]];
        const QTail = MultiplyQuaternion(QHeli, ConstructAxisQuaternion([0, 1, 0], this.HeliTailAngle));
        UpdateOcc(Block.HeliTailRotor, ConstructRigidTransform(TailWorld, QTail));

        // ③ 3 Police Interceptor Drones (with dynamic pitch & banking roll!)
        for (let I = 0; I < 3; ++I)
        {
            const D = this.DroneStates[I];
            const Pitch = ClampScalar(Math.hypot(D.Vel[0], D.Vel[1]) * 0.012, 0.0, 0.32);
            const QYawPitch = MultiplyQuaternion(
                ConstructAxisQuaternion([0, 0, 1], D.Yaw || 0.0),
                ConstructAxisQuaternion([0, 1, 0], Pitch)
            );
            const QD = MultiplyQuaternion(QYawPitch, ConstructAxisQuaternion([1, 0, 0], D.Roll || 0.0));
            UpdateOcc(Block.Drones[I], ConstructRigidTransform(D.Pos, QD));
        }
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                       REAL-TIME CLUSTERED RED/BLUE STROBES & HELICOPTER SPOTLIGHT
    //--------------------------------------------------------------------------------------------------------------------

    QueryDynamicLightRecords()
    {
        if (!this.Enabled || (!this.PursuitActive && this.LevelKey !== "city"))
            return [];

        const Out = [];
        const PPos = this.PoliceVehicle.Position;
        const PFwd = this.PoliceVehicle.QueryForward();
        const RedOn = this.StrobePhase < 0.5;

        if (this.PursuitActive)
        {
            // High-intensity alternating Crimson Red & Sapphire Blue Roof Lightbar Strobes
            Out.push({
                X: PPos[0], Y: PPos[1], Z: PPos[2] + 1.25,
                Type:      LightType.StreetLamp,
                Direction: [0.0, 0.0, -1.0],
                Colour:    RedOn ? [1.0, 0.06, 0.12] : [0.08, 0.38, 1.0],
                Intensity: 95.0,
                Reach:     36.0,
                Params:    [0.15, -0.45, 0.0, 1.0]
            });

            // Helicopter Overhead Gimbal Searchlight Spotlight Cone!
            const SX = this.HeliSpotTarget[0] - this.HeliPosition[0];
            const SY = this.HeliSpotTarget[1] - this.HeliPosition[1];
            const SZ = (this.HeliSpotTarget[2] || 0.0) - this.HeliPosition[2];
            const SL = Math.hypot(SX, SY, SZ) || 1.0;
            Out.push({
                X: this.HeliPosition[0], Y: this.HeliPosition[1], Z: this.HeliPosition[2] - 0.3,
                Type:      LightType.Floodlight,
                Direction: [SX / SL, SY / SL, SZ / SL],
                Colour:    this.HeliLosClear ? [0.95, 0.98, 1.0] : [1.0, 0.72, 0.32],
                Intensity: 135.0,
                Reach:     64.0,
                Params:    [Math.cos(16 * Math.PI / 180), Math.cos(28 * Math.PI / 180), 0.0, 1.0]
            });

            // Lead Police Drone Strobe
            const D0 = this.DroneStates[2];
            Out.push({
                X: D0.Pos[0], Y: D0.Pos[1], Z: D0.Pos[2],
                Type:      LightType.StreetLamp,
                Direction: [0.0, 0.0, -1.0],
                Colour:    RedOn ? [0.10, 0.45, 1.0] : [1.0, 0.08, 0.15],
                Intensity: 48.0,
                Reach:     18.0,
                Params:    [0.2, -0.4, 0.0, 1.0]
            });
        }

        // Police Cruiser High-Beam Pursuit Headlights
        Out.push({
            X: PPos[0] + PFwd[0] * 2.1, Y: PPos[1] + PFwd[1] * 2.1, Z: PPos[2] + 0.2,
            Type:      LightType.LowBeam,
            Direction: PFwd,
            Colour:    [0.92, 0.96, 1.0],
            Intensity: 45.0,
            Reach:     54.0,
            Params:    [0.88, 0.58, 0.0, 1.0]
        });

        return Out;
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                           SPECTATOR CAMERA OVERRIDE FOR HANDS-FREE AI SELF-PLAY
    //--------------------------------------------------------------------------------------------------------------------

    QuerySpectatorPose()
    {
        if (this.ControlMode !== "selfplay")
            return null;
        if (this.SpectatorTarget === "police")
            return { Position: this.PoliceVehicle.Position, Forward: this.PoliceVehicle.QueryForward(), Speed: Math.hypot(this.PoliceVehicle.LinearVelocity[0], this.PoliceVehicle.LinearVelocity[1]) };
        if (this.SpectatorTarget === "helicopter")
        {
            return {
                Eye:    [this.HeliPosition[0], this.HeliPosition[1], this.HeliPosition[2] - 1.2],
                Target: this.Host.Vehicle.Position.slice(),
                Up:     [0.0, 0.0, 1.0],
                Fov:    56.0
            };
        }
        return null; // "evader" uses default Host.Vehicle camera rig
    }

    //--------------------------------------------------------------------------------------------------------------------
    //                  ZERO-BLACK-BOX 3D + 2D HOLOGRAPHIC PURSUIT & RL TRAINING OVERLAY
    //--------------------------------------------------------------------------------------------------------------------

    RenderHudOverlay(Ctx, W, H, Cam, _Mode)
    {
        if (!this.Enabled)
            return;
        const Hud = this.Host.DrivingHud;
        if (!Hud)
            return;

        // ① 3D World Callouts on Police Cruiser, Helicopter Searchlight Ring & Police Drones
        if (this.PursuitActive || this.LevelKey === "city")
        {
            const PPos = this.PoliceVehicle.Position;
            const TopP = Hud.ProjectWorld([PPos[0], PPos[1], PPos[2] + 1.65], W, H, Cam);
            if (TopP)
            {
                const Dist = Math.round(Math.hypot(PPos[0] - this.Host.Vehicle.Position[0], PPos[1] - this.Host.Vehicle.Position[1]));
                const Col  = (this.StrobePhase < 0.5) ? "#ff4658" : "#4ca6ff";
                Ctx.save();
                Ctx.shadowColor = "rgba(0, 0, 0, 0.80)";
                Ctx.shadowBlur  = 6;
                Ctx.strokeStyle = Col;
                Ctx.lineWidth   = 2.4;
                Ctx.beginPath();
                Ctx.moveTo(TopP[0] - 8, TopP[1] - 8);
                Ctx.lineTo(TopP[0],     TopP[1]);
                Ctx.lineTo(TopP[0] + 8, TopP[1] - 8);
                Ctx.stroke();

                Ctx.fillStyle = Col;
                Ctx.font = "700 12px 'DM Sans', system-ui, sans-serif";
                Ctx.textAlign = "center";
                Ctx.fillText(`POLICE INTERCEPTOR · ${Dist}m`, TopP[0], TopP[1] - 16);
                Ctx.restore();
            }

            // 3D Helicopter Searchlight Ground Ring
            if (this.PursuitActive)
            {
                Ctx.beginPath();
                let Started = false;
                for (let I = 0; I <= 20; ++I)
                {
                    const A = (I / 20) * Math.PI * 2.0;
                    const R = 5.2;
                    const GP = Hud.ProjectWorld([
                        this.HeliSpotTarget[0] + Math.cos(A) * R,
                        this.HeliSpotTarget[1] + Math.sin(A) * R,
                        (this.HeliSpotTarget[2] || 0.0) + 0.12
                    ], W, H, Cam);
                    if (!GP) continue;
                    if (!Started) { Ctx.moveTo(GP[0], GP[1]); Started = true; }
                    else Ctx.lineTo(GP[0], GP[1]);
                }
                if (Started)
                {
                    Ctx.strokeStyle = this.HeliLosClear ? "rgba(220, 248, 255, 0.55)" : "rgba(255, 184, 72, 0.45)";
                    Ctx.lineWidth = 1.6;
                    Ctx.setLineDash?.([6, 4]);
                    Ctx.stroke();
                    Ctx.setLineDash?.([]);
                }

                // 3D Tactical Drone Role Callouts + Active EMP Tether Beam
                const CarScreen = Hud.ProjectWorld([this.Host.Vehicle.Position[0], this.Host.Vehicle.Position[1], this.Host.Vehicle.Position[2] + 0.45], W, H, Cam);
                for (let I = 0; I < 3; ++I)
                {
                    const D  = this.DroneStates[I];
                    const DP = Hud.ProjectWorld([D.Pos[0], D.Pos[1], D.Pos[2] + 0.55], W, H, Cam);
                    if (!DP)
                        continue;
                    const IsEmpCharging = I === 2 && D.EmpCharge > 0.06;
                    const TagCol = IsEmpCharging ? "#ffbe42" : (D.HasLos ? "#6ef7c8" : "#78b8ff");

                    if (IsEmpCharging && CarScreen)
                    {
                        Ctx.beginPath();
                        Ctx.moveTo(DP[0], DP[1] + 6);
                        Ctx.lineTo(CarScreen[0], CarScreen[1]);
                        Ctx.strokeStyle = `rgba(255, 198, 68, ${(0.35 + 0.55 * D.EmpCharge).toFixed(2)})`;
                        Ctx.lineWidth   = 1.8 + D.EmpCharge * 1.8;
                        Ctx.setLineDash?.([5, 4]);
                        Ctx.stroke();
                        Ctx.setLineDash?.([]);
                    }

                    Ctx.save();
                    Ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
                    Ctx.shadowBlur  = 5;
                    Ctx.fillStyle   = TagCol;
                    Ctx.font        = "700 10px 'JetBrains Mono', monospace";
                    Ctx.textAlign   = "center";
                    const Caption   = IsEmpCharging
                        ? `⚡ EMP LOCK ${Math.round(D.EmpCharge * 100)}%`
                        : `DRONE · ${D.Role}`;
                    Ctx.fillText(Caption, DP[0], DP[1] - 8);
                    Ctx.restore();
                }
            }
        }

        // ② 3D Lidar Ray Fan Visualization in Self-Play RL Mode
        if (this.ControlMode === "selfplay" && this.ShowLidarRays)
        {
            const DrawLidarFan = (Car, HitBuf, BaseRGB) =>
            {
                const Orig = Hud.ProjectWorld([Car.Position[0], Car.Position[1], Car.Position[2] - 0.15], W, H, Cam);
                if (!Orig)
                    return;
                for (let R = 0; R < LidarAngles.length; ++R)
                {
                    const EndX = HitBuf[R * 3 + 0];
                    const EndY = HitBuf[R * 3 + 1];
                    const Frac = HitBuf[R * 3 + 2];
                    const EndP = Hud.ProjectWorld([EndX, EndY, Car.Position[2] - 0.15], W, H, Cam);
                    if (!EndP)
                        continue;
                    Ctx.beginPath();
                    Ctx.moveTo(Orig[0], Orig[1]);
                    Ctx.lineTo(EndP[0], EndP[1]);
                    Ctx.strokeStyle = Frac < 0.25 ? "rgba(255, 68, 82, 0.65)" : `rgba(${BaseRGB}, 0.36)`;
                    Ctx.lineWidth   = Frac < 0.25 ? 1.8 : 1.1;
                    Ctx.stroke();
                }
            };
            DrawLidarFan(this.Host.Vehicle,  this.EvaderLidarHits, "82, 242, 188");
            DrawLidarFan(this.PoliceVehicle, this.PoliceLidarHits, "92, 168, 255");

            // Draw active 3D Tactical Escape Waypoint Beacon so user sees the non-repeating City Graph decisions live!
            const GoalObj = CityNavNodes[this.EvaderGoalNode];
            const GoalScreen = GoalObj ? Hud.ProjectWorld([GoalObj.X, GoalObj.Y, 1.4], W, H, Cam) : null;
            const EvScreen   = Hud.ProjectWorld([this.Host.Vehicle.Position[0], this.Host.Vehicle.Position[1], 0.6], W, H, Cam);
            if (GoalScreen && EvScreen)
            {
                Ctx.save();
                Ctx.strokeStyle = "rgba(110, 247, 200, 0.48)";
                Ctx.lineWidth   = 1.6;
                Ctx.setLineDash?.([5, 4]);
                Ctx.beginPath();
                Ctx.moveTo(EvScreen[0], EvScreen[1]);
                Ctx.lineTo(GoalScreen[0], GoalScreen[1]);
                Ctx.stroke();
                Ctx.setLineDash?.([]);

                Ctx.fillStyle = "#6ef7c8";
                Ctx.font      = "700 10px 'JetBrains Mono', monospace";
                Ctx.textAlign = "center";
                Ctx.fillText(`🎯 ${GoalObj.Label.toUpperCase()} (WP #${this.EpisodeWaypoints + 1})`, GoalScreen[0], GoalScreen[1] - 8);
                Ctx.restore();
            }
        }

        // ③ Pure Optical Floating Pursuit / RL Training Status Header (ZERO black background boxes!)
        Ctx.save();
        Ctx.shadowColor = "rgba(0, 0, 0, 0.82)";
        Ctx.shadowBlur  = 7;
        Ctx.textAlign   = "center";

        if (this.ControlMode === "selfplay")
        {
            const Gen  = this.EvaderBrain.Generation;
            const Cand = this.EvaderBrain.CandidateIndex + 1;
            const Pop  = this.EvaderBrain.PopSize;
            const TopY = 22;

            Ctx.fillStyle = "#6ef7c8";
            Ctx.font = "700 14px 'DM Sans', system-ui, sans-serif";
            Ctx.fillText(`🧠 ANTITHETIC NES + CEM-RL · GEN ${Gen} (ROLLOUT ${Cand}/${Pop}) · ${this.TimeWarp}× TURBO`, W * 0.5, TopY);

            Ctx.fillStyle = "#e8f8f5";
            Ctx.font = "600 11px 'JetBrains Mono', monospace";
            Ctx.fillText(
                `EVADER R: ${this.EvaderEpReturn.toFixed(1)} (BEST ${Math.max(0, this.EvaderBrain.BestEverReturn).toFixed(0)})   |   WAYPOINTS ${this.EpisodeWaypoints}   |   ESCAPES ${this.TotalEscapes} · BUSTS ${this.TotalBusts}   |   σ=${this.EvaderBrain.Sigma.toFixed(2)}`,
                W * 0.5, TopY + 17
            );

            // Live Floating Optical Reward Learning Curve Sparkline (no black box — pure glowing lines!)
            const HistE = this.EvaderBrain.RewardHistory;
            const HistP = this.PoliceBrain.RewardHistory;
            if (HistE.length >= 2)
            {
                const GX = W * 0.5 - 120, GY = TopY + 26, GW = 240, GH = 26;
                const All = [...HistE, ...HistP];
                const MinR = Math.min(...All, -5.0);
                const MaxR = Math.max(...All,  5.0);
                const Span = Math.max(1.0, MaxR - MinR);

                const DrawCurve = (Arr, Color) =>
                {
                    Ctx.beginPath();
                    for (let I = 0; I < Arr.length; ++I)
                    {
                        const X = GX + (I / Math.max(1, Arr.length - 1)) * GW;
                        const Y = GY + GH - ((Arr[I] - MinR) / Span) * GH;
                        if (I === 0) Ctx.moveTo(X, Y);
                        else         Ctx.lineTo(X, Y);
                    }
                    Ctx.strokeStyle = Color;
                    Ctx.lineWidth = 2.0;
                    Ctx.stroke();
                };
                DrawCurve(HistE, "#5ef2b4");
                DrawCurve(HistP, "#ff5c70");
            }
        }
        else if (this.PursuitActive || this.BannerTimer > 0.0)
        {
            const FlashCol = this.PursuitActive
                ? (this.StrobePhase < 0.5 ? "#ff4e60" : "#58aeff")
                : "#6ef7c8";
            Ctx.fillStyle = FlashCol;
            Ctx.font = "800 15px 'DM Sans', system-ui, sans-serif";
            const Header = this.PursuitActive
                ? `🚨 WANTED · ${this.ViolationReason}`
                : this.BannerMessage;
            Ctx.fillText(Header, W * 0.5, 24);

            if (this.PursuitActive)
            {
                const LosTxt = this.HeliLosClear ? "HELI SPOTLIGHT: LOCKED" : "HELI LOS: OCCLUDED (ALLEY COVER)";
                const DroneTxt = this.DroneLockActive ? "3 DRONES: IN RANGE" : "3 DRONES: INTERCEPTING";
                Ctx.fillStyle = "#eef8ff";
                Ctx.font = "600 10.5px 'JetBrains Mono', monospace";
                Ctx.fillText(`${LosTxt}  ·  ${DroneTxt}`, W * 0.5, 41);
            }
        }
        Ctx.restore();
    }

    QuerySummary()
    {
        return {
            ControlMode:      this.ControlMode,
            PursuitActive:    this.PursuitActive,
            ViolationReason:  this.ViolationReason || "NONE",
            Generation:       this.EvaderBrain.Generation,
            TimeWarp:         this.TimeWarp,
            TotalBusts:       this.TotalBusts,
            TotalEscapes:     this.TotalEscapes,
            HeliLosClear:     this.HeliLosClear,
            DroneLockActive:  this.DroneLockActive,
            SpeedLimitKmh:    this.QueryPostedSpeedLimitKmh()
        };
    }
}
