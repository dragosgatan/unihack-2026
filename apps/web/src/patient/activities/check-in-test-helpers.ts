import { act, screen } from '@testing-library/react';

let pressedAt = 0;

export const press = (name: string | RegExp) => {
  const click = new MouseEvent('click', { bubbles: true, detail: 0 });
  pressedAt += 1000;
  Object.defineProperty(click, 'timeStamp', { value: pressedAt });
  act(() => {
    screen.getByRole('button', { name }).dispatchEvent(click);
  });
};
