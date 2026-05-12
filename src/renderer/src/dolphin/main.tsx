import React from 'react';
import { createRoot } from 'react-dom/client';
import { DolphinApp } from './DolphinApp';

const root = createRoot(document.getElementById('root')!);
root.render(<DolphinApp />);
