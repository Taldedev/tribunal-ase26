/*
 * theme.js - one place for the look of the application.
 *
 * The palette is deliberately sober: this is a court record, and the only
 * colour that carries meaning is the pair used for the two verdicts, so
 * nothing else competes with them.
 */

import { createTheme } from "@mui/material/styles";

const GUILTY_RED = "#a03038";
const NOT_GUILTY_GREEN = "#2f6b4f";

/*
 * The only colours in the application that carry meaning. Both verdict
 * vocabularies are keyed here, so the colour follows the answer whichever
 * question the case asked.
 */
export const VERDICT_COLORS = {
    GUILTY: GUILTY_RED,
    "NOT GUILTY": NOT_GUILTY_GREEN,
    "NOT JUSTIFIED": GUILTY_RED,
    JUSTIFIED: NOT_GUILTY_GREEN,
    FAILED: "#8a8f98"
};

export const SIDE_COLORS = {
    Prosecution: GUILTY_RED,
    Defence: "#2f5d8a"
};

const theme = createTheme({
    palette: {
        mode: "light",
        primary: { main: "#1f2933", dark: "#141b22" },
        secondary: { main: "#a37b2c" },
        background: { default: "#f4f5f7", paper: "#ffffff" },
        error: { main: GUILTY_RED },
        success: { main: NOT_GUILTY_GREEN }
    },
    typography: {
        fontFamily:
            '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        h5: { fontWeight: 600, letterSpacing: "-0.01em" },
        h6: { fontWeight: 600 },
        subtitle2: { fontWeight: 600 }
    },
    shape: { borderRadius: 4 },
    components: {
        MuiPaper: {
            styleOverrides: {
                root: { backgroundImage: "none" }
            }
        },
        MuiButton: {
            defaultProps: { disableElevation: true }
        }
    }
});

export default theme;
