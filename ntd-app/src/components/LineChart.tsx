type Props = {
  values: number[];
  height?: number;
  color?: string;
  gridLines?: number[];
  id: string;
};

const VB_W = 669;

export default function LineChart({
  values,
  height = 190,
  color = 'var(--amber)',
  gridLines = [40, 90, 140],
  id,
}: Props) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 14;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * VB_W;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = `M${points.join(' L')}`;
  const area = `${line} L${VB_W},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', width: '100%', height }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridLines
        .filter((y) => y < height)
        .map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2={VB_W}
            y2={y}
            stroke="#191c20"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
