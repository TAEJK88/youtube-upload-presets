// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('useAsk outside the provider throws a clear error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Grab />)).toThrow(/AskProvider/);
    err.mockRestore();
  });
});
