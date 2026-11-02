// Display list: pages as positioned text, lines, rectangles, circles and images. Layout
// produces it (songs, pages, the table of contents, chord diagrams); the preview draws
// it as SVG and pdf.ts writes it to PDF, so both show the same thing. All measurements
// are in PDF points (1/72 inch); y grows downwards from the top of the page.

export interface TextItem {
  type: 'text';
  x: number;
  /** Baseline position. */
  y: number;
  text: string;
  font: string;
  size: number;
  role: 'title' | 'subtitle' | 'lyrics' | 'chord' | 'comment' | 'label' | 'folio';
  /** Source line index, so the preview can jump to the editor. */
  line?: number;
}

export interface RuleItem {
  type: 'rule';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
}

export interface ImageItem {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
}

/** Outlined rectangle with rounded corners. */
export interface RectItem {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  lineWidth: number;
}

/** Circle centred on (x, y): a finger dot when filled, an open string when not. */
export interface DotItem {
  type: 'dot';
  x: number;
  y: number;
  r: number;
  fill: boolean;
  lineWidth: number;
}

export type DrawItem = TextItem | RuleItem | ImageItem | RectItem | DotItem;

/** An item moved by (dx, dy). */
export function shiftItem(it: DrawItem, dx: number, dy: number): DrawItem {
  return it.type === 'rule' ? { ...it, x1: it.x1 + dx, y1: it.y1 + dy, x2: it.x2 + dx, y2: it.y2 + dy } : { ...it, x: it.x + dx, y: it.y + dy };
}

export interface LaidPage {
  width: number;
  height: number;
  items: DrawItem[];
}
