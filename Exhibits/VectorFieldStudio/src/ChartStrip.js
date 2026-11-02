/*====================================================================================================================================
                                                        CHARTSTRIP.JS
====================================================================================================================================*/
// 🧩 Small canvas charts: magnitude histogram, vertical profile, and vector dial.

function prepare(canvas) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
        canvas.width = Math.floor(width * ratio);
        canvas.height = Math.floor(height * ratio);
    }
    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context, width, height };
}

export function drawHistogram(canvas, stats, options = {}) {
    if (!canvas) return;
    const { context, width, height } = prepare(canvas);
    const accent = options.accent || '#a9bd9c';
    const line = 'rgba(255,255,255,0.08)';
    context.strokeStyle = line;
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
    if (!stats || !stats.values || stats.values.length === 0) {
        context.fillStyle = 'rgba(222,222,213,0.4)';
        context.font = '10px system-ui, sans-serif';
        context.fillText('Collecting field samples…', 8, height / 2);
        return;
    }
    const bins = 30;
    const counts = new Array(bins).fill(0);
    const min = stats.min;
    const max = Math.max(stats.max, min + 0.0001);
    for (const value of stats.values) {
        const index = Math.min(bins - 1, Math.max(0, Math.floor(((value - min) / (max - min)) * bins)));
        counts[index]++;
    }
    const peak = Math.max(1, ...counts);
    const padding = 2;
    const barWidth = (width - padding * 2) / bins;
    for (let i = 0; i < bins; i++) {
        const barHeight = (counts[i] / peak) * (height - 12);
        const x = padding + i * barWidth;
        const y = height - barHeight;
        const gradient = context.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, accent);
        gradient.addColorStop(1, 'rgba(169,189,156,0.12)');
        context.fillStyle = gradient;
        context.fillRect(x + 0.5, y, Math.max(1, barWidth - 1), barHeight);
    }
    const meanX = padding + ((stats.mean - min) / (max - min)) * (width - padding * 2);
    context.strokeStyle = 'rgba(244,241,214,0.8)';
    context.setLineDash([3, 3]);
    context.beginPath();
    context.moveTo(meanX, 0);
    context.lineTo(meanX, height);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = 'rgba(222,222,213,0.55)';
    context.font = '9px system-ui, sans-serif';
    context.fillText(min.toFixed(1), 2, height - 1);
    context.textAlign = 'right';
    context.fillText(max.toFixed(1), width - 2, height - 1);
    context.textAlign = 'left';
}

export function drawProfile(canvas, profile, options = {}) {
    if (!canvas) return;
    const { context, width, height } = prepare(canvas);
    const accent = options.accent || '#7fc8b0';
    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
        const y = (height / 4) * i;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
    }
    if (!profile || profile.length < 2) {
        context.fillStyle = 'rgba(222,222,213,0.4)';
        context.font = '10px system-ui, sans-serif';
        context.fillText('No profile', 8, height / 2);
        return;
    }
    const maxSpeed = Math.max(0.001, ...profile.map((point) => point.speed));
    const maxHeight = Math.max(0.001, ...profile.map((point) => point.height));
    const points = profile.map((point) => ({
        x: (point.speed / maxSpeed) * (width - 8) + 4,
        y: height - (point.height / maxHeight) * (height - 10) - 2,
    }));
    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(127,200,176,0.08)');
    gradient.addColorStop(1, accent);
    context.beginPath();
    context.moveTo(points[0].x, height);
    for (const point of points) context.lineTo(point.x, point.y);
    context.lineTo(points[points.length - 1].x, height);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.strokeStyle = accent;
    context.lineWidth = 1.4;
    context.stroke();
    context.fillStyle = 'rgba(222,222,213,0.55)';
    context.font = '9px system-ui, sans-serif';
    context.fillText('0', 2, height - 1);
    context.textAlign = 'right';
    context.fillText(`${maxSpeed.toFixed(1)} u`, width - 2, 10);
    context.textAlign = 'left';
}

export function drawVectorDial(canvas, vector, options = {}) {
    if (!canvas) return;
    const { context, width, height } = prepare(canvas);
    const accent = options.accent || '#a9bd9c';
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.36;
    context.strokeStyle = 'rgba(255,255,255,0.12)';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(cx - radius, cy);
    context.lineTo(cx + radius, cy);
    context.moveTo(cx, cy - radius);
    context.lineTo(cx, cy + radius);
    context.strokeStyle = 'rgba(255,255,255,0.06)';
    context.stroke();
    if (!vector) return;
    const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
    if (magnitude < 0.0001) return;
    const angle = Math.atan2(vector[2], vector[0]);
    const length = Math.min(1, Math.log1p(magnitude) / Math.log1p(20)) * radius * 0.9;
    const ex = cx + Math.cos(angle) * length;
    const ey = cy + Math.sin(angle) * length;
    context.strokeStyle = accent;
    context.fillStyle = accent;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(ex, ey);
    context.stroke();
    const head = 4;
    context.beginPath();
    context.moveTo(ex, ey);
    context.lineTo(ex - Math.cos(angle - 0.5) * head, ey - Math.sin(angle - 0.5) * head);
    context.lineTo(ex - Math.cos(angle + 0.5) * head, ey - Math.sin(angle + 0.5) * head);
    context.closePath();
    context.fill();
    context.fillStyle = 'rgba(222,222,213,0.5)';
    context.font = '8px system-ui, sans-serif';
    context.fillText('X', cx + radius + 2, cy + 3);
    context.fillText('Z', cx + 2, cy + radius + 9);
}
