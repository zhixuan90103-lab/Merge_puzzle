/**
 * Merge Puzzle prototype boot.
 * Keep: adapt/*, create-renderer optional shell, haptics optional.
 */

import { Capacitor } from '@capacitor/core';
import {
  DESIGN_HEIGHT,
  DESIGN_SAFE,
  DESIGN_WIDTH,
  applyStageTransform,
  computeStageLayout,
  watchStageLayout,
  type StageLayout,
} from './adapt/design';
import {
  mountDevicePreview,
  type DevicePreviewController,
} from './adapt/devicePreview';
import { applyNativeClass, applySafeAreaCssVars, readSafeAreaInsets } from './adapt/safeArea';
import { createGame } from './game/game';
import { mountGameView } from './game/view';

const shell = document.getElementById('shell')!;
const viewportEl = document.getElementById('viewport')!;
const stage = document.getElementById('stage')!;
const uiRoot = document.getElementById('ui-root')!;

async function boot(): Promise<void> {
  applyNativeClass();

  const platform = Capacitor.getPlatform();
  const native = Capacitor.isNativePlatform();

  // Soft background only — no interactive WebGPU demo (avoids steal pointer)
  try {
    const { createRenderer, resizeToDesign } = await import('./create-renderer');
    const renderer = await createRenderer({ container: stage });
    // Hide canvas under board
    const canvas = stage.querySelector('canvas');
    if (canvas) {
      canvas.style.pointerEvents = 'none';
      canvas.style.opacity = '0';
    }
    let latest: StageLayout | null = null;
    let preview: DevicePreviewController;

    const onLayout = (layout: StageLayout) => {
      latest = layout;
      applyStageTransform(stage, layout);
      applySafeAreaCssVars(native);
      resizeToDesign(renderer);
      void readSafeAreaInsets();
    };

    preview = mountDevicePreview(shell, viewportEl, () => {
      const size = preview.getViewSize();
      onLayout(computeStageLayout(size.width, size.height, 'contain'));
    });

    const unwatch = watchStageLayout(onLayout, {
      mode: 'contain',
      getViewSize: () => preview.getViewSize(),
    });

    const game = createGame();
    const view = mountGameView(stage, uiRoot, game, () => latest);

    window.addEventListener(
      'pagehide',
      () => {
        view.destroy();
        unwatch();
        preview.dispose();
        renderer.setAnimationLoop(null);
        renderer.dispose();
      },
      { once: true },
    );

    console.info(
      `[Merge Puzzle] prototype · ${platform} · design ${DESIGN_WIDTH}×${DESIGN_HEIGHT}` +
        (native ? '' : ` · desktop safe sim ${DESIGN_SAFE.top}/${DESIGN_SAFE.bottom}`),
    );
  } catch (err) {
    // Fallback: layout only + game without WebGPU
    console.warn('WebGPU shell skipped', err);
    let latest: StageLayout | null = null;
    let preview: DevicePreviewController;

    const onLayout = (layout: StageLayout) => {
      latest = layout;
      applyStageTransform(stage, layout);
      applySafeAreaCssVars(native);
    };

    preview = mountDevicePreview(shell, viewportEl, () => {
      const size = preview.getViewSize();
      onLayout(computeStageLayout(size.width, size.height, 'contain'));
    });

    watchStageLayout(onLayout, {
      mode: 'contain',
      getViewSize: () => preview.getViewSize(),
    });

    const game = createGame();
    mountGameView(stage, uiRoot, game, () => latest);
  }
}

boot().catch((err) => {
  console.error(err);
  uiRoot.textContent = `boot failed: ${err instanceof Error ? err.message : String(err)}`;
});
