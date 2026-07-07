/**
 * Single source for every table/cup color and material accent. Reskinning the
 * table or the koozie (custom faces, seasonal themes, …) means passing a
 * different TableTheme — never editing mesh components. See docs/TABLE_UI.md.
 */
export interface TableTheme {
  /** Scene background + fog color (they must match or the horizon seam shows). */
  background: string;
  felt: string;
  rail: string;
  railHighlight: string;
  /** Solid rail body below the surface — the occluder for the docked koozie. */
  apron: string;
  cup: {
    body: string;
    emissive: string;
    emissiveIntensity: number;
    opacity: number;
    rim: string;
    rimOpacity: number;
  };
}

export const DEFAULT_TABLE_THEME: TableTheme = {
  background: '#14191f',
  felt: '#1d6b3a',
  rail: '#3a2a1a',
  railHighlight: '#5c4228',
  apron: '#241a10',
  cup: {
    body: '#b8d8ec',
    emissive: '#3a5a6e',
    emissiveIntensity: 0.15,
    opacity: 0.52,
    rim: '#e8f4fa',
    rimOpacity: 0.55,
  },
};
