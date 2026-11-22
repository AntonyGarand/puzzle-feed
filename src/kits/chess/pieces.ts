import './board.css';
import { L } from '../../core/i18n';

/** Text glyphs by piece type (1 pawn … 6 king), forced to text presentation (never emoji). */
export const GLYPH = ['', '♟', '♞', '♝', '♜', '♛', '♚'].map((g) => (g ? g + '\uFE0E' : ''));

/** Piece names by type (1 pawn … 6 king), lower case, in the current locale. */
export const pieceName = (p: number) =>
  ['', L('pawn', 'pion'), L('knight', 'cavalier'), L('bishop', 'fou'), L('rook', 'tour'), L('queen', 'dame'), L('king', 'roi')][
    Math.abs(p)
  ];

/** Square name ("e4") on an n×n board, row 0 at the top. */
export const sqName = (sq: number, n = 8) => 'abcdefgh'[sq % n] + (n - Math.floor(sq / n));
