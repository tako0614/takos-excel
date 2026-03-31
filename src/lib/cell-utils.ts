/**
 * Convert a 0-based column index to a letter (A, B, ..., Z, AA, AB, ...)
 */
export function columnToLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

/**
 * Convert a column letter (A, B, ..., Z, AA, AB, ...) to a 0-based index
 */
export function letterToColumn(letter: string): number {
  let col = 0;
  for (let i = 0; i < letter.length; i++) {
    col = col * 26 + (letter.charCodeAt(i) - 64);
  }
  return col - 1;
}

/**
 * Parse a cell address like "A1" into { col, row } (0-based)
 */
export function parseCellAddress(addr: string): { col: number; row: number } {
  const match = addr.match(/^([A-Z]+)(\d+)$/);
  if (!match) {
    throw new Error(`Invalid cell address: ${addr}`);
  }
  return {
    col: letterToColumn(match[1]),
    row: parseInt(match[2], 10) - 1,
  };
}

/**
 * Format a 0-based col and row into a cell address like "A1"
 */
export function formatCellAddress(col: number, row: number): string {
  return `${columnToLetter(col)}${row + 1}`;
}

/**
 * Get the range of cell addresses between two corners (inclusive)
 */
export function getCellRange(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
): string[] {
  const addresses: string[] = [];
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      addresses.push(formatCellAddress(c, r));
    }
  }
  return addresses;
}
