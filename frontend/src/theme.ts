import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1f6feb',
    },
    background: {
      default: '#f6f7f9',
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '"Roboto", "Segoe UI", system-ui, sans-serif',
  },
});
