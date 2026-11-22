// Guide captions for sweep deductions (shared by shape-mines and mow).
import { L } from '../../core/i18n';
import type { Deduction } from './solve';

const tiles = (n: number) => L(n === 1 ? 'one tile' : `${n} tiles`, n === 1 ? 'une case' : `${n} cases`);
const mines = (n: number) => L(n === 1 ? 'one mine' : `${n} mines`, n === 1 ? 'une mine' : `${n} mines`);

/**
 * Explain a deduction. `clue(i)` names clue `i` as [en, fr] (e.g. ['2', '2'] or ['2 (cross)',
 * '2 (croix)']); `flags(i)` is how many known mines it already counts; `act` is the verb for
 * safe tiles as [en, fr] ('open', 'ouvrez').
 */
export function explain(d: Deduction, clue: (i: number) => [string, string], flags: (i: number) => number, act: [string, string]): string {
  const [ae, af] = clue(d.a.at);
  const k = d.cells.length;
  if (!d.b) {
    if (d.mine)
      return L(
        `This ${ae} counts exactly ${k === 1 ? 'one unknown tile' : `${k} unknown tiles`}${flags(d.a.at) ? ' besides its flags' : ''}, so ${k === 1 ? 'it is a mine' : 'they are all mines'}. Flag ${k === 1 ? 'it' : 'them'}.`,
        `Ce ${af} compte exactement ${k === 1 ? 'une case inconnue' : `${k} cases inconnues`}${flags(d.a.at) ? ' en plus de ses drapeaux' : ''} : ${k === 1 ? 'c’est une mine' : 'ce sont toutes des mines'}. Posez ${k === 1 ? 'un drapeau' : 'des drapeaux'}.`,
      );
    const f = flags(d.a.at);
    if (!f)
      return L(
        `This ${ae} sees no mines at all, so every tile it counts is safe: ${act[0]} ${k === 1 ? 'it' : 'them'}.`,
        `Ce ${af} ne voit aucune mine : toutes les cases qu’il compte sont sûres. ${act[1]}-${k === 1 ? 'la' : 'les'}.`,
      );
    return L(
      `This ${ae} already has ${f === 1 ? 'its mine' : `its ${f} mines`} flagged, so its other tiles are safe: ${act[0]} ${k === 1 ? 'it' : 'them'}.`,
      `Ce ${af} a déjà ${f === 1 ? 'sa mine marquée' : `ses ${f} mines marquées`} : ses autres cases sont sûres. ${act[1]}-${k === 1 ? 'la' : 'les'}.`,
    );
  }
  const [be, bf] = clue(d.b.at);
  if (!d.mine)
    return L(
      `The ${ae} must put at least ${mines(d.lo!)} in the tiles it shares with this ${be}, which only has ${d.b.m} left to place: the ${be}’s other ${k === 1 ? 'tile is' : 'tiles are'} safe.`,
      `Le ${af} doit mettre au moins ${mines(d.lo!)} dans les cases qu’il partage avec ce ${bf}, à qui il n’en reste que ${d.b.m} : ${k === 1 ? 'l’autre case' : 'les autres cases'} du ${bf} ${k === 1 ? 'est sûre' : 'sont sûres'}.`,
    );
  return L(
    `The ${ae} fits at most ${mines(d.hi!)} in the tiles it shares with this ${be}, which still needs ${d.b.m}: its other ${k === 1 ? 'tile is a mine' : `${k} tiles are mines`}.`,
    `Le ${af} met au plus ${mines(d.hi!)} dans les cases partagées avec ce ${bf}, à qui il en faut encore ${d.b.m} : ${k === 1 ? 'son autre case est une mine' : `ses ${k} autres cases sont des mines`}.`,
  );
}

/** Caption for the mine-total rule. */
export function explainCount(allSafe: boolean, n: number, act: [string, string]): string {
  return allSafe
    ? L(
        `Every mine is flagged, so the last ${n === 1 ? 'tile is' : 'tiles are'} safe: ${act[0]} ${n === 1 ? 'it' : 'them'}.`,
        `Toutes les mines sont marquées : ${n === 1 ? 'la dernière case est sûre' : 'les dernières cases sont sûres'}. ${act[1]}-${n === 1 ? 'la' : 'les'}.`,
      )
    : L(
        `Only ${tiles(n)} left and exactly as many mines still unflagged: they are all mines.`,
        `Il reste ${tiles(n)} et exactement autant de mines à marquer : ce sont toutes des mines.`,
      );
}
