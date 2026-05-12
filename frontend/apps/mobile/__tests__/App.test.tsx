/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@/app/bootstrap', () => ({
  bootstrapApp: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/app/navigation/RootNavigator', () => ({
  RootNavigator: () => null,
}));

test('renders correctly', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
  });
});
