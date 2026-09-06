/*
 * SpeechesPanel.jsx - the four speeches the judges read.
 *
 * They are grouped by side so the two prosecution cases sit next to each other
 * and the two defence cases next to each other, which is the only arrangement
 * in which it is easy to see that the two speakers on a side actually argued
 * differently rather than twice.
 */

import React from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import { SIDE_COLORS } from "../theme.js";
import { formatDuration } from "../lib/money.js";

function SpeechBlock(props) {
    const speech = props.speech;
    const color = SIDE_COLORS[speech.role] || "#666";

    return (
        <Accordion defaultExpanded={props.defaultExpanded} disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                    direction="row"
                    alignItems="center"
                    gap={1.5}
                    sx={{ width: "100%", pr: 1, minWidth: 0 }}
                >
                    <Box sx={{ width: 4, alignSelf: "stretch", backgroundColor: color, borderRadius: 1 }} />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>
                            {speech.speakerName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                            {speech.speakerTitle}
                        </Typography>
                    </Box>
                    <Chip
                        size="small"
                        label={speech.role}
                        sx={{ color: color, borderColor: color }}
                        variant="outlined"
                    />
                    {speech.ok ? (
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                            {formatDuration(speech.elapsedMs)}
                        </Typography>
                    ) : (
                        <Chip size="small" label="not delivered" color="error" variant="outlined" />
                    )}
                    {speech.truncated ? (
                        <Chip size="small" label="cut off" color="warning" variant="outlined" />
                    ) : null}
                </Stack>
            </AccordionSummary>
            <AccordionDetails>
                {speech.ok ? (
                    <Box>
                        <Typography
                            variant="body2"
                            sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7, maxWidth: "68ch" }}
                        >
                            {speech.text}
                        </Typography>
                        {speech.truncated ? (
                            <Alert severity="warning" sx={{ mt: 1.5 }}>
                                This speech reached its length limit and stops mid-sentence. The
                                judges were told, so the abrupt ending was not read as the
                                advocate's conclusion.
                            </Alert>
                        ) : null}
                    </Box>
                ) : (
                    <Alert severity="error">
                        This speech was never delivered: {speech.error} The judges were told the
                        seat was empty and ruled on the record without it.
                    </Alert>
                )}
            </AccordionDetails>
        </Accordion>
    );
}

export default function SpeechesPanel(props) {
    const speeches = props.speeches || [];
    const prosecution = speeches.filter(function (speech) {
        return speech.role === "Prosecution";
    });
    const defence = speeches.filter(function (speech) {
        return speech.role === "Defence";
    });

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                The four speeches
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Called at the same time, from the charge sheet alone. No representative
                saw another's address. The seat says who called them, not what they
                concluded — each reasons in character to their own answer.
            </Typography>

            <Typography variant="overline" sx={{ color: SIDE_COLORS.Prosecution }}>
                Called from the prosecution seats
            </Typography>
            <Stack gap={1} sx={{ mb: 2.5, mt: 0.5 }}>
                {prosecution.map(function (speech) {
                    return <SpeechBlock key={speech.speakerId} speech={speech} />;
                })}
            </Stack>

            <Typography variant="overline" sx={{ color: SIDE_COLORS.Defence }}>
                Called from the defence seats
            </Typography>
            <Stack gap={1} sx={{ mt: 0.5 }}>
                {defence.map(function (speech) {
                    return <SpeechBlock key={speech.speakerId} speech={speech} />;
                })}
            </Stack>
        </Box>
    );
}
