// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AskProvider, useAsk, type AskOptions } from '../entrypoints/sidepanel/ask';

afterEach(cleanup);

let ask!: (o: AskOptions) => Promise<boolean | null>;
function Grab() {
  ask = useAsk();
  return null;
}
const open = (o: AskOptions) => {
  let p!: Promise<boolean | null>;
  act(() => { p = ask(o); });
  return p;
};

describe('ask (the drawer\'s confirm box)', () => {
  it('two buttons: OK → true, Cancel → false, Escape → false', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Delete?', ok: 'Delete', danger: true });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await p).toBe(true);
    p = open({ title: 'Delete?' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(false);
    p = open({ title: 'Delete?' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await p).toBe(false);
  });

  it('three buttons: the second answers false, dismissing answers null', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: "Someone else's" }));
    expect(await p).toBe(false);
    p = open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await p).toBe(null);
  });

  it('Enter confirms; a new question dismisses the open one', async () => {
    render(<AskProvider><Grab /></AskProvider>);
    const first = open({ title: 'One', ok: 'Yes', no: 'No' });
    const second = open({ title: 'Two' });
    expect(await first).toBe(null);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(await second).toBe(true);
  });

  it('by default the main button is selected when the question opens', () => {
    render(<AskProvider><Grab /></AskProvider>);
    void open({ title: 'Delete?', ok: 'Delete', danger: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }));
    void open({ title: 'Import', ok: 'My file', no: "Someone else's" });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'My file' }));
  });

  // P5-ask-cancel: a question whose yes cannot be undone opens on Cancel.
  it("focus: 'cancel' selects Cancel; Enter answers no, yes needs a click", async () => {
    const user = userEvent.setup();
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('focus:outline-2'); // a ring a click cannot hide
    await user.keyboard('{Enter}'); // Enter on the selected button is that button's click
    expect(await p).toBe(false);
    p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' }); // focus left the buttons (a click on the text)
    expect(await p).toBe(false);
    p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    fireEvent.click(screen.getByRole('button', { name: 'Start trim' }));
    expect(await p).toBe(true);
    p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    await user.keyboard('{Tab}{Enter}'); // a deliberate Tab, then Enter
    expect(await p).toBe(true);
    p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(await p).toBe(false);
  });

  it("focus: 'cancel' on a question that replaces one opened on the main button still selects Cancel", async () => {
    render(<AskProvider><Grab /></AskProvider>);
    const first = open({ title: 'Upload?', ok: 'Upload' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Upload' }));
    const p = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    expect(await first).toBe(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    void open({ title: 'Upload?', ok: 'Upload' });
    expect(await p).toBe(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Upload' }));
  });

  it("focus: 'cancel' with three buttons: Cancel is selected and Enter dismisses (null)", async () => {
    const user = userEvent.setup();
    render(<AskProvider><Grab /></AskProvider>);
    let p = open({ title: 'Import', ok: 'My file', no: "Someone else's", focus: 'cancel' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Enter}');
    expect(await p).toBe(null);
    p = open({ title: 'Import', ok: 'My file', no: "Someone else's", focus: 'cancel' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(await p).toBe(null);
  });

  it("focus: 'cancel' on a question that replaces another one opened on Cancel starts on Cancel again", async () => {
    const user = userEvent.setup();
    render(<AskProvider><Grab /></AskProvider>);
    const first = open({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Start trim' }));
    const p = open({ title: 'Trim more?', ok: 'Start trim', focus: 'cancel' });
    expect(await first).toBe(null);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Enter}');
    expect(await p).toBe(false);
  });

  // The second click of a double-click on the button that asked can land on the yes button
  // (a short panel puts it right there): a pointer click that soon after opening is not an answer.
  describe('a pointer click just after the question opens', () => {
    let now = 0;
    const at = (ms: number) => { now = 1000 + ms; };
    const openAt0 = (o: AskOptions) => { at(0); return open(o); };
    const settled = async (p: Promise<boolean | null>) => Promise.race([p, new Promise((r) => setTimeout(() => r('open'), 0))]);
    beforeEach(() => { vi.spyOn(performance, 'now').mockImplementation(() => now); });
    afterEach(() => { vi.restoreAllMocks(); });

    it("focus: 'cancel': ignored on yes at 100 ms (the question stays open), an answer at 900 ms", async () => {
      render(<AskProvider><Grab /></AskProvider>);
      const p = openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      at(100);
      fireEvent.click(screen.getByRole('button', { name: 'Start trim' }), { detail: 2 });
      expect(await settled(p)).toBe('open');
      expect(screen.getByRole('dialog')).toBeTruthy();
      at(799);
      fireEvent.click(screen.getByRole('button', { name: 'Start trim' }), { detail: 1 });
      expect(await settled(p)).toBe('open');
      at(900);
      fireEvent.click(screen.getByRole('button', { name: 'Start trim' }), { detail: 1 });
      expect(await p).toBe(true);
    });

    it("focus: 'cancel': a keyboard click on yes at 100 ms is an answer, and Cancel never waits", async () => {
      const user = userEvent.setup();
      render(<AskProvider><Grab /></AskProvider>);
      let p = openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      at(100);
      await user.keyboard('{Tab}{Enter}');
      expect(await p).toBe(true);
      p = openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      at(100);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }), { detail: 1 });
      expect(await p).toBe(false);
    });

    it("focus: 'cancel' with three buttons: the second button waits like yes, Cancel does not", async () => {
      render(<AskProvider><Grab /></AskProvider>);
      const o = { title: 'Import', ok: 'My file', no: "Someone else's", focus: 'cancel' as const };
      let p = openAt0(o);
      at(100);
      fireEvent.click(screen.getByRole('button', { name: "Someone else's" }), { detail: 1 });
      fireEvent.click(screen.getByRole('button', { name: 'My file' }), { detail: 1 });
      expect(await settled(p)).toBe('open');
      at(900);
      fireEvent.click(screen.getByRole('button', { name: "Someone else's" }), { detail: 1 });
      expect(await p).toBe(false);
      p = openAt0(o);
      at(100);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }), { detail: 1 });
      expect(await p).toBe(null);
    });

    it('a question that replaces another starts its own wait', async () => {
      render(<AskProvider><Grab /></AskProvider>);
      void openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      at(900);
      const p = open({ title: 'Trim more?', ok: 'Start trim', focus: 'cancel' });
      at(1000);
      fireEvent.click(screen.getByRole('button', { name: 'Start trim' }), { detail: 1 });
      expect(await settled(p)).toBe('open');
    });

    // The press moves focus to the button under it: an ignored click must not leave yes selected.
    it("focus: 'cancel': an ignored click leaves Cancel selected, and Enter then answers no", async () => {
      const user = userEvent.setup();
      render(<AskProvider><Grab /></AskProvider>);
      const p = openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      const yes = screen.getByRole('button', { name: 'Start trim' });
      at(150);
      expect(fireEvent.pointerDown(yes)).toBe(false); // the hasty press is cancelled: it moves no focus
      expect(fireEvent.mouseDown(yes, { detail: 2 })).toBe(false);
      yes.focus(); // and if it moved it all the same
      fireEvent.click(yes, { detail: 2 });
      expect(await settled(p)).toBe('open');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
      at(2000);
      await user.keyboard('{Enter}');
      expect(await p).toBe(false);
    });

    it("focus: 'cancel': a press in the first 800 ms is ignored whenever it is released", async () => {
      render(<AskProvider><Grab /></AskProvider>);
      const p = openAt0({ title: 'Trim?', ok: 'Start trim', focus: 'cancel' });
      const yes = screen.getByRole('button', { name: 'Start trim' });
      at(400);
      fireEvent.pointerDown(yes);
      fireEvent.mouseDown(yes, { detail: 1 });
      at(1000); // held 600 ms
      fireEvent.click(yes, { detail: 1 });
      expect(await settled(p)).toBe('open');
      at(1100); // a press that never became a click (released elsewhere) is forgotten by the next press
      expect(fireEvent.pointerDown(yes)).toBe(true);
      expect(fireEvent.mouseDown(yes, { detail: 1 })).toBe(true);
      at(1200);
      fireEvent.click(yes, { detail: 1 });
      expect(await p).toBe(true);
    });

    it("focus: 'cancel': the second click of a double-click is never an answer, however slow; a single click is", async () => {
      render(<AskProvider><Grab /></AskProvider>);
      const o = { title: 'Import', ok: 'My file', no: "Someone else's", focus: 'cancel' as const };
      const p = openAt0(o);
      at(3000);
      expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'My file' }), { detail: 2 })).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: 'My file' }), { detail: 2 });
      fireEvent.click(screen.getByRole('button', { name: "Someone else's" }), { detail: 3 });
      expect(await settled(p)).toBe('open');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
      at(3500);
      fireEvent.click(screen.getByRole('button', { name: 'My file' }), { detail: 1 });
      expect(await p).toBe(true);
    });

    it('by default a press and a double-click are answers at once, and no press is cancelled', async () => {
      render(<AskProvider><Grab /></AskProvider>);
      const p = openAt0({ title: 'Delete?', ok: 'Delete', danger: true });
      at(100);
      expect(fireEvent.pointerDown(screen.getByRole('button', { name: 'Delete' }))).toBe(true);
      expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete' }), { detail: 2 })).toBe(true);
      at(1000);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }), { detail: 2 });
      expect(await p).toBe(true);
    });

    it('by default a pointer click at 100 ms is an answer, as before', async () => {
      render(<AskProvider><Grab /></AskProvider>);
      let p = openAt0({ title: 'Delete?', ok: 'Delete', danger: true });
      at(100);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }), { detail: 2 });
      expect(await p).toBe(true);
      p = openAt0({ title: 'Import', ok: 'My file', no: "Someone else's" });
      at(100);
      fireEvent.click(screen.getByRole('button', { name: "Someone else's" }), { detail: 1 });
      expect(await p).toBe(false);
    });
  });

  it('useAsk outside the provider throws a clear error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow(/AskProvider/);
    err.mockRestore();
  });
});
