/*
 * VerdictsPanel.jsx - the three rulings, kept side by side.
 *
 * The three are never merged into one answer, and the tally underneath is
 * labelled as a count rather than as a decision. A panel exists to show where
 * a hard question divides opinion; averaging it away throws out the only thing
 * three judges give you that one judge does not.
 *
 * A judge whose call failed, or whose answer could not be read as a verdict
 * with at least two reasons, is shown as a failure in the same row as the
 * others. It never becomes a default verdict, because a default that enters
 * the record is read afterwards as a decision.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import ReportProblemIcon from "@mui/icons-material/ReportProblem";

import { VERDICT_COLORS } from "../theme.js";
import { formatDuration } from "../lib/money.js";

function VerdictCard(props) {
    const ruling = props.ruling;
    const failed = !ruling.ok;
    const color = failed ? VERDICT_COLORS.FAILED : VERDICT_COLORS[ruling.verdict];

    return (
        <Card
            variant="outlined"
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                borderTop: "4px solid " + color
            }}
        >
            <CardContent sx={{ flexGrow: 1 }}>
                {/* The verdict comes first. Everything else is why. */}
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                    {failed ? (
                        <ReportProblemIcon sx={{ color: color }} />
                    ) : (
                        <GavelIcon sx={{ color: color }} />
                    )}
                    <Typography variant="h5" sx={{ color: color, lineHeight: 1.1 }}>
                        {failed ? "NO RULING" : ruling.verdict}
                    </Typography>
                </Stack>

                <Typography variant="subtitle2">{ruling.judgeName}</Typography>
                <Typography variant="caption" color="text.secondary">
                    {ruling.judgeTitle}
                </Typography>

                {failed ? (
                    <Alert severity="error" sx={{ mt: 2 }} icon={false}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            {ruling.failure === "call"
                                ? "The call to this judge failed."
                                : "The answer did not meet the standard of the court."}
                        </Typography>
                        <Typography variant="body2">{ruling.problem}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                            This seat is empty. It is not a verdict either way.
                        </Typography>
                    </Alert>
                ) : (
                    <Box sx={{ mt: 2 }}>
                        {typeof ruling.confidence === "number" ? (
                            <Box sx={{ mb: 2 }}>
                                <Stack direction="row" justifyContent="space-between">
                                    <Typography variant="caption" color="text.secondary">
                                        Confidence
                                    </Typography>
                                    <Typography variant="caption" fontWeight={600}>
                                        {ruling.confidence}
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={ruling.confidence}
                                    sx={{
                                        height: 5,
                                        borderRadius: 3,
                                        "& .MuiLinearProgress-bar": { backgroundColor: color }
                                    }}
                                />
                            </Box>
                        ) : null}

                        <Typography variant="overline" color="text.secondary">
                            Reasons
                        </Typography>
                        <Stack component="ol" sx={{ m: 0, pl: 2.5, mb: 2 }} gap={0.75}>
                            {ruling.reasons.map(function (reason, index) {
                                return (
                                    <Typography component="li" variant="body2" key={index}>
                                        {reason}
                                    </Typography>
                                );
                            })}
                        </Stack>

                        {ruling.decisive ? (
                            <Chip
                                size="small"
                                variant="outlined"
                                label={"Moved most by " + ruling.decisive}
                                sx={{ mb: 1 }}
                            />
                        ) : null}
                    </Box>
                )}
            </CardContent>

            <Divider />
            <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="caption" color="text.secondary">
                    {ruling.modelId}
                    {ruling.elapsedMs ? " · " + formatDuration(ruling.elapsedMs) : ""}
                </Typography>
            </Box>
        </Card>
    );
}

export default function VerdictsPanel(props) {
    const rulings = props.rulings || [];
    const tally = props.tally;

    return (
        <Box>
            <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                flexWrap="wrap"
                gap={1}
                sx={{ mb: 1.5 }}
            >
                <Typography variant="h6">Three verdicts, kept side by side</Typography>
                <Typography variant="body2" color="text.secondary">
                    Each judge ruled alone and never saw the others.
                </Typography>
            </Stack>

            <Grid container spacing={2}>
                {rulings.map(function (ruling) {
                    return (
                        <Grid key={ruling.judgeId} size={{ xs: 12, md: 4 }}>
                            <VerdictCard ruling={ruling} />
                        </Grid>
                    );
                })}
            </Grid>

            {tally ? (
                <Alert
                    severity={tally.split ? "warning" : "info"}
                    sx={{ mt: 2 }}
                    icon={false}
                >
                    <Typography variant="body2">
                        <strong>How the panel fell:</strong> {tally.guilty}{" "}
                        {(tally.positiveWord || "guilty").toLowerCase()}, {tally.notGuilty}{" "}
                        {(tally.negativeWord || "not guilty").toLowerCase()}
                        {tally.failed > 0
                            ? ", " + tally.failed + " seat" + (tally.failed === 1 ? "" : "s") + " empty"
                            : ""}
                        .{" "}
                        {tally.split
                            ? "The panel divided, and the division is the finding. This court does not merge the verdicts."
                            : tally.delivered > 0
                              ? "The panel agreed. That is a count of three opinions, not a single ruling of the court."
                              : "No judge returned a usable ruling."}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                        You weigh them and judge for yourself.
                    </Typography>
                </Alert>
            ) : null}
        </Box>
    );
}
