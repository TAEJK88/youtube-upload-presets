// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Button } from '../components/ui/button';
import { Icon } from '../entrypoints/sidepanel/Icon';

afterEach(cleanup);

describe('panel test setup', () => {
  it('renders components with JSX and Tailwind classes', () => {
    render(<Button variant="go"><Icon name="play" />Start</Button>);
    const b = screen.getByRole('button', { name: 'Start' });
    expect(b.className).toContain('bg-fg');
    expect(b.querySelector('path')?.getAttribute('d')?.startsWith('M320-258')).toBe(true);
  });
});
