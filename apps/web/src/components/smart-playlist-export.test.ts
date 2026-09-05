import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isValidElement,
  type ChangeEvent,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { SmartPlaylistExport, type SmartPlaylistExportProps } from './smart-playlist-export';

const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
}));

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState(initial: unknown) {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [
      hooks.states[index],
      (value: unknown) => {
        hooks.states[index] = value;
      },
    ];
  },
  useRef(initial: unknown) {
    const index = hooks.refIndex++;
    hooks.refs[index] ??= { current: initial };
    return hooks.refs[index];
  },
}));

interface ElementProps {
  children?: ReactNode;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  href?: string;
  value?: string;
  target?: string;
  rel?: string;
}

function elements(node: ReactNode): Array<ReactElement<ElementProps>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return isValidElement<ElementProps>(node) ? content(node.props.children) : '';
}

const props: SmartPlaylistExportProps = {
  definition: { energyMin: '70', sort: 'energy-desc', limit: '30' },
  initialName: 'MuseVault — Smart Playlist',
  hasExportScope: true,
  returnTo: '/smart-playlists?energyMin=70&sort=energy-desc&limit=30',
  authorizationFailed: false,
};
const playlist = {
  id: 'a'.repeat(22),
  name: 'MuseVault — Smart Playlist',
  url: `https://open.spotify.com/playlist/${'a'.repeat(22)}`,
};

function render(overrides: Partial<SmartPlaylistExportProps> = {}) {
  hooks.stateIndex = 0;
  hooks.refIndex = 0;
  return SmartPlaylistExport({ ...props, ...overrides });
}

function element(tree: ReactNode, type: string) {
  const found = elements(tree).find((node) => node.type === type);
  if (!found) throw new Error(`Expected ${type} element`);
  return found;
}

function submit(tree = render()) {
  const preventDefault = vi.fn();
  element(tree, 'form').props.onSubmit!({
    preventDefault,
  } as unknown as FormEvent<HTMLFormElement>);
  expect(preventDefault).toHaveBeenCalledOnce();
}

async function waitForCompletion() {
  await vi.waitFor(() => {
    expect(elements(render()).find((node) => node.type === 'button')?.props.disabled ?? false).toBe(
      false,
    );
  });
}

beforeEach(() => {
  hooks.states = [];
  hooks.refs = [];
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => vi.unstubAllGlobals());

describe('Smart Playlist export controls', () => {
  it('offers optional authorization preserving the local definition without submitting an export', () => {
    const tree = render({ hasExportScope: false });
    const link = element(tree, 'a');
    expect(content(tree)).toContain('permission is required only to export');
    expect(content(tree)).toContain('without publishing the playlist publicly');
    expect(content(tree)).toContain('Reconnect Spotify to enable export');
    const url = new URL(link.props.href!, 'https://musevault.test');
    expect(url.pathname).toBe('/api/auth/spotify/login');
    expect(url.searchParams.get('capability')).toBe('playlist-export');
    expect(url.searchParams.get('returnTo')).toBe(props.returnTo);
    expect(elements(tree).some((node) => node.type === 'form')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('requires explicit submission and guards rapid duplicates before React can rerender', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const tree = render();
    expect(content(tree)).toContain('Create playlist on Spotify');
    expect(content(tree)).toContain('without publishing it publicly');
    expect(content(tree)).toContain('Spotify manages private access separately in its app');
    expect(content(tree)).not.toContain('Create private playlist on Spotify');
    expect(fetch).not.toHaveBeenCalled();
    submit(tree);
    submit(tree);
    expect(fetch).toHaveBeenCalledOnce();
    expect(element(render(), 'button').props.disabled).toBe(true);
    expect(element(render(), 'input').props.disabled).toBe(true);
    finish(Response.json({ state: 'success', playlist, trackCount: 30 }));
    await waitForCompletion();
    expect(content(render())).toContain('30 tracks added');
  });

  it('submits a trimmed name and definition with no client track list and renders validated success', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ state: 'success', playlist, trackCount: 30 }),
    );
    const tree = render();
    element(tree, 'input').props.onChange!({
      target: { value: '  My playlist  ' },
    } as ChangeEvent<HTMLInputElement>);
    submit(render());
    await waitForCompletion();
    expect(fetch).toHaveBeenCalledWith('/api/spotify/playlists', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'My playlist', definition: props.definition }),
    });
    const result = render();
    expect(content(result)).toContain('Playlist created on Spotify');
    expect(content(result)).toContain('30 tracks added');
    const link = element(result, 'a');
    expect(link.props.href).toBe(playlist.url);
    expect(link.props.target).toBe('_blank');
    expect(link.props.rel).toBe('noopener noreferrer');
  });

  it.each(['   ', 'x'.repeat(101), 'bad\nname', 'bad\u007fname'])(
    'rejects an invalid name before any POST',
    (name) => {
      const tree = render();
      element(tree, 'input').props.onChange!({
        target: { value: name },
      } as ChangeEvent<HTMLInputElement>);
      submit(render());
      expect(fetch).not.toHaveBeenCalled();
      expect(content(render())).toContain('without control characters');
    },
  );

  it('offers reauthorization after the server detects a missing write scope', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          state: 'error',
          error: { code: 'reauthorization_required', retryAfter: null },
        },
        { status: 403 },
      ),
    );
    submit();
    await waitForCompletion();
    expect(content(render())).toContain('Reconnect Spotify to enable export');
    expect(content(render())).toContain('Your preview is still available');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports a created playlist with unconfirmed tracks as a distinct partial failure and retains its link', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          state: 'partial_failure',
          playlist,
          error: { code: 'export_uncertain', retryAfter: null },
        },
        { status: 502 },
      ),
    );
    submit();
    await waitForCompletion();
    const result = render();
    expect(content(result)).toContain('Playlist created; tracks unconfirmed');
    expect(content(result)).toContain('could not confirm that all preview tracks were added');
    expect(content(result)).not.toContain('Playlist created on Spotify');
    expect(element(result, 'a').props.href).toBe(playlist.url);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports wrong visibility without claiming tracks were added', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          state: 'partial_failure',
          playlist,
          error: { code: 'wrong_visibility', retryAfter: null },
        },
        { status: 502 },
      ),
    );
    submit();
    await waitForCompletion();
    const result = render();
    expect(content(result)).toContain('Playlist published unexpectedly');
    expect(content(result)).toContain('Spotify reported that the playlist was published publicly');
    expect(content(result)).toContain('MuseVault did not add any tracks');
    expect(content(result)).not.toContain('tracks added');
    expect(element(result, 'a').props.href).toBe(playlist.url);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports safe Retry-After information without automatically retrying', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json(
        {
          state: 'error',
          error: { code: 'rate_limited', retryAfter: 60 },
        },
        { status: 429 },
      ),
    );
    submit();
    await waitForCompletion();
    expect(content(render())).toContain('Wait at least 60 seconds');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not replay an ambiguous network failure or leak its details', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('private network diagnostic'));
    submit();
    await waitForCompletion();
    expect(content(render())).toContain(
      'Check your Spotify playlists before creating another playlist',
    );
    expect(content(render())).not.toContain('private network diagnostic');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { state: 'success', playlist: { ...playlist, url: 'javascript:alert(1)' }, trackCount: 30 },
    { state: 'success', playlist, trackCount: 51 },
    {
      state: 'partial_failure',
      playlist: { ...playlist, url: 'https://attacker.test/playlist' },
      error: { code: 'export_uncertain', retryAfter: null },
    },
    { state: 'error', error: { code: 'raw spotify error with secret', retryAfter: null } },
  ])(
    'treats an invalid response as uncertain without rendering untrusted links or raw errors',
    async (payload) => {
      vi.mocked(fetch).mockResolvedValue(Response.json(payload));
      submit();
      await waitForCompletion();
      const result = render();
      expect(content(result)).toContain('could not confirm the export result');
      expect(content(result)).not.toContain('raw spotify error');
      expect(elements(result).some((node) => node.type === 'a')).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it('allows another deliberate submission after successful completion', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ state: 'success', playlist, trackCount: 30 }),
    );
    submit();
    await waitForCompletion();
    submit(render());
    await waitForCompletion();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
