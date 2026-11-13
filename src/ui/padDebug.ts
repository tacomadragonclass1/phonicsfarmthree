/**
 * Controller read-out, shown only when the address ends in `?pad`. It prints what
 * the browser reports for every connected pad, so a wrong button order can be seen
 * on the machine that has the controller instead of guessed at.
 */
export function showPadDebug(): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;max-width:90vw;' +
    'background:rgba(0,0,0,.78);color:#fff;font:14px/1.35 monospace;white-space:pre-wrap;pointer-events:none';
  document.body.appendChild(box);

  const frame = (): void => {
    const lines: string[] = [];
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad) continue;
      const down: number[] = [];
      pad.buttons.forEach((button, index) => { if (button.pressed) down.push(index); });
      lines.push(
        `pad ${i}: ${pad.id}`,
        `  mapping: "${pad.mapping}"  buttons: ${pad.buttons.length}  axes: ${pad.axes.length}`,
        `  pressed: ${down.length ? down.join(', ') : '-'}`,
        `  axes: ${Array.from(pad.axes, (a) => a.toFixed(2)).join('  ')}`,
      );
    }
    box.textContent = lines.length
      ? lines.join('\n')
      : 'No controller seen by the browser.\nPress any button on it once; browsers hide a pad until then.';
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
