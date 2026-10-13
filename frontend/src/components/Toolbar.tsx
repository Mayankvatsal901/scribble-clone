interface ToolbarProps {
  color: string;
  size: number;
  erasing: boolean;
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  onEraser: () => void;
  onUndo: () => void;
  onClear: () => void;
}

const COLORS = [
  "#000000", "#7f7f7f", "#c1c1c1", "#ef130b", "#ff7100", "#ffe400",
  "#00cc00", "#00b2ff", "#231fd3", "#a300ba", "#d37caa", "#a0522d",
];
const SIZES = [4, 8, 16, 28];

// Only the drawer sees this. It just changes settings in Canvas;
// undo and clear are sent to the server from Canvas.
function Toolbar(props: ToolbarProps) {
  const { color, size, erasing, onColor, onSize, onEraser, onUndo, onClear } = props;

  return (
    <div className="card toolbar">
      <div className="colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={!erasing && c === color ? "swatch selected" : "swatch"}
            style={{ background: c }}
            onClick={() => onColor(c)}
            aria-label={`Colour ${c}`}
          />
        ))}
      </div>

      <div className="sizes">
        {SIZES.map((s) => (
          <button
            key={s}
            className={s === size ? "size-btn selected" : "size-btn"}
            onClick={() => onSize(s)}
            aria-label={`Brush size ${s}`}
          >
            <span className="dot" style={{ width: Math.min(s, 22), height: Math.min(s, 22) }} />
          </button>
        ))}
      </div>

      <button className={erasing ? "btn btn-small selected" : "btn btn-small"} onClick={onEraser}>
        Eraser
      </button>
      <button className="btn btn-small" onClick={onUndo}>
        Undo
      </button>
      <button className="btn btn-small" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

export default Toolbar;