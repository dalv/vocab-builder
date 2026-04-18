import type { MasteryLevel } from "../lib/srs";

/**
 * Three ascending bars — like a cell-signal indicator — showing how well
 * a word is memorized (0 = empty / never reviewed, 3 = consolidated).
 */
export default function SignalBars({
  level,
  className,
  title,
}: {
  level: MasteryLevel;
  className?: string;
  title?: string;
}) {
  const bars: { x: number; y: number; h: number; n: MasteryLevel }[] = [
    { x: 0, y: 8, h: 6, n: 1 },
    { x: 5, y: 4, h: 10, n: 2 },
    { x: 10, y: 0, h: 14, n: 3 },
  ];
  return (
    <svg
      className={`signal-bars${className ? ` ${className}` : ""}`}
      viewBox="0 0 13 14"
      width="14"
      height="15"
      aria-label={`Mastery level ${level} of 3`}
      role="img"
    >
      {title && <title>{title}</title>}
      {bars.map((b) => (
        <rect
          key={b.n}
          x={b.x}
          y={b.y}
          width={3}
          height={b.h}
          rx={0.5}
          className={level >= b.n ? "signal-bar-on" : "signal-bar-off"}
        />
      ))}
    </svg>
  );
}
