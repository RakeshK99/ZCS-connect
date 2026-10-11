import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, MAIZE, NAVY, type Palette } from './tokens';

interface Theme {
  c: Palette;
  isDark: boolean;
  /** strong selection fill (navy in light, maize in dark) */
  strong: string;
  strongTx: string;
}

const ThemeContext = createContext<Theme>({ c: light, isDark: false, strong: NAVY, strongTx: '#FFFFFF' });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const value = useMemo<Theme>(() => {
    const isDark = scheme === 'dark';
    return { c: isDark ? dark : light, isDark, strong: isDark ? MAIZE : NAVY, strongTx: isDark ? NAVY : '#FFFFFF' };
  }, [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
