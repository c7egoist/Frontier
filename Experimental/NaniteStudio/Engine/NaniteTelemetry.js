/*==========================================================================================================================================
                                                         NANITETELEMETRY.JS
==========================================================================================================================================*/
/**
 * 🧩 Nanite Telemetry, Metrics & Diagnostic Visualizer
 *
 * Provides:
 *   - Rolling 60-sample frame time history buffer.
 *   - Real-time LOD level distribution histogram data.
 *   - Formatted engineering readouts with SI multipliers (K, M).
 *   - Telemetry drawer event log stream.
 */

export class NaniteTelemetryManager
{
    constructor(MaxHistorySamples = 60)
    {
        this.MaxSamples = MaxHistorySamples;
        this.FrameTimes = new Float32Array(MaxHistorySamples);
        this.ActiveTrianglesHistory = new Uint32Array(MaxHistorySamples);
        this.SampleIndex = 0;
        this.LogEvents = [];
    }

    recordSample(FrameTimeMs, ActiveTriangles)
    {
        this.FrameTimes[this.SampleIndex] = FrameTimeMs;
        this.ActiveTrianglesHistory[this.SampleIndex] = ActiveTriangles;
        this.SampleIndex = (this.SampleIndex + 1) % this.MaxSamples;
    }

    addLog(Message, Level = 'info')
    {
        const Time = new Date().toLocaleTimeString();
        this.LogEvents.unshift({ Time, Message, Level });
        if (this.LogEvents.length > 50) this.LogEvents.pop();
    }

    static FormatCount(Count)
    {
        if (Count >= 1_000_000)
        {
            return (Count / 1_000_000).toFixed(2) + ' M';
        }
        if (Count >= 1_000)
        {
            return (Count / 1_000).toFixed(1) + ' K';
        }
        return Count.toLocaleString();
    }

    static FormatError(ErrorPx)
    {
        if (ErrorPx < 0.001) return '0.00 px';
        return ErrorPx.toFixed(2) + ' px';
    }

    drawFrameTimeGraph(Canvas)
    {
        if (!Canvas) return;
        const Ctx = Canvas.getContext('2d');
        const W = Canvas.width, H = Canvas.height;
        Ctx.clearRect(0, 0, W, H);

        // Background grid lines
        Ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        Ctx.lineWidth = 1;
        Ctx.beginPath();
        Ctx.moveTo(0, H * 0.5); Ctx.lineTo(W, H * 0.5);
        Ctx.moveTo(0, H * 0.25); Ctx.lineTo(W, H * 0.25);
        Ctx.stroke();

        // 16.6 ms (60 FPS) target line
        Ctx.strokeStyle = 'rgba(232, 194, 122, 0.35)';
        Ctx.setLineDash([3, 3]);
        Ctx.beginPath();
        const Y60 = H - (16.6 / 33.3) * H;
        Ctx.moveTo(0, Y60); Ctx.lineTo(W, Y60);
        Ctx.stroke();
        Ctx.setLineDash([]);

        // Rolling graph line
        Ctx.strokeStyle = '#2ee572';
        Ctx.lineWidth = 2;
        Ctx.beginPath();

        const Step = W / (this.MaxSamples - 1);
        for (let i = 0; i < this.MaxSamples; ++i)
        {
            const ReadIdx = (this.SampleIndex + i) % this.MaxSamples;
            const Ms = Math.min(33.3, this.FrameTimes[ReadIdx]);
            const X = i * Step;
            const Y = H - (Ms / 33.3) * H;

            if (i === 0) Ctx.moveTo(X, Y);
            else Ctx.lineTo(X, Y);
        }
        Ctx.stroke();
    }

    drawLODHistogram(Canvas, LevelCounts)
    {
        if (!Canvas || !LevelCounts) return;
        const Ctx = Canvas.getContext('2d');
        const W = Canvas.width, H = Canvas.height;
        Ctx.clearRect(0, 0, W, H);

        const Total = LevelCounts.reduce((a, b) => a + b, 0);
        if (Total === 0) return;

        const Colors = ['#2ee572', '#18d5f2', '#f2be22', '#f27222', '#e52e2e'];
        const Labels = ['LOD 0', 'LOD 1', 'LOD 2', 'LOD 3', 'LOD 4'];
        const BarCount = LevelCounts.length;
        const BarWidth = Math.floor((W - (BarCount + 1) * 8) / BarCount);
        const MaxCount = Math.max(1, ...LevelCounts);

        for (let i = 0; i < BarCount; ++i)
        {
            const Count = LevelCounts[i];
            const BarHeight = Math.max(4, Math.floor((Count / MaxCount) * (H - 24)));
            const X = 8 + i * (BarWidth + 8);
            const Y = H - 18 - BarHeight;

            // Bar background slot
            Ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            Ctx.fillRect(X, 6, BarWidth, H - 24);

            // Active bar
            Ctx.fillStyle = Colors[i];
            Ctx.beginPath();
            Ctx.roundRect ? Ctx.roundRect(X, Y, BarWidth, BarHeight, [4, 4, 0, 0]) : Ctx.fillRect(X, Y, BarWidth, BarHeight);
            Ctx.fill();

            // Label
            Ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            Ctx.font = '9px "DM Sans", sans-serif';
            Ctx.textAlign = 'center';
            Ctx.fillText(Labels[i], X + BarWidth * 0.5, H - 4);

            // Count
            Ctx.fillStyle = '#ffffff';
            Ctx.font = '10px "DM Sans", sans-serif';
            Ctx.fillText(Count.toString(), X + BarWidth * 0.5, Y - 4);
        }
    }
}
