/*
 * CourtroomScene.jsx - the panel while it is sitting.
 *
 * A deliberation takes half a minute and makes seven calls in two waves, and
 * the shape of those waves is the interesting part: the four advocates really
 * do speak at once, and the bench really does sit idle until every speech is
 * in. A row of spinners hides that. A courtroom shows it, and the room is laid
 * out the way the argument is: prosecution on one side, defence on the other,
 * the bench above them both.
 *
 * Every animation here is driven by real state - a figure only speaks while
 * its call is genuinely open, and a gavel only falls when a verdict has
 * actually been parsed. Nothing is on a timer for decoration.
 */

import React from "react";
import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import { SPEAKERS, JUDGES } from "../tribunal/personas.js";
import { CALLS_PER_RUN } from "../constants.js";
import { VERDICT_COLORS, SIDE_COLORS } from "../theme.js";
import { formatDuration } from "../lib/money.js";

/* ---- the movements of the room ---------------------------------------- */

// A ring that swells out of a figure that is currently speaking.
const halo = keyframes`
  0%   { transform: scale(0.85); opacity: 0.55; }
  70%  { transform: scale(1.5);  opacity: 0; }
  100% { transform: scale(1.5);  opacity: 0; }
`;

// Three dots under a speaker, the way a person is shown mid-sentence.
const speak = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40%           { transform: translateY(-4px); opacity: 1; }
`;

// A judge weighing: the gavel lifts and falls, never quite striking.
const weigh = keyframes`
  0%, 100% { transform: rotate(-16deg); }
  50%      { transform: rotate(6deg); }
`;

// The strike, once, when the ruling lands.
const strike = keyframes`
  0%   { transform: rotate(-38deg); }
  55%  { transform: rotate(12deg); }
  70%  { transform: rotate(2deg); }
  100% { transform: rotate(0deg); }
`;

// A verdict arriving on the record like a stamp.
const stampIn = keyframes`
  0%   { transform: scale(2.2) rotate(-12deg); opacity: 0; }
  60%  { transform: scale(0.94) rotate(-4deg); opacity: 1; }
  100% { transform: scale(1) rotate(-4deg); opacity: 1; }
`;

// The bench waking once the speeches are in.
const riseIn = keyframes`
  from { transform: translateY(6px); opacity: 0.35; }
  to   { transform: translateY(0);   opacity: 1; }
`;

const REDUCED = "@media (prefers-reduced-motion: reduce)";

/* ---- one figure in the room -------------------------------------------- */

function Figure(props) {
    const { call, active, accent, kind, name, subtitle } = props;
    const done = Boolean(call && call.ok);
    const failed = Boolean(call && !call.ok);
    const idle = !call && !active;

    const verdict = call && call.verdict ? call.verdict : null;
    const ringColor = failed ? VERDICT_COLORS.FAILED : verdict ? VERDICT_COLORS[verdict] : accent;

    return (
        <Stack alignItems="center" sx={{ width: { xs: 78, sm: 96 }, position: "relative" }}>
            <Box sx={{ position: "relative", width: 56, height: 56 }}>
                {/* the swelling ring, only while this call is genuinely open */}
                {active ? (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: -4,
                            borderRadius: "50%",
                            border: "2px solid",
                            borderColor: accent,
                            animation: `${halo} 1.8s ease-out infinite`,
                            [REDUCED]: { animation: "none", opacity: 0.4 }
                        }}
                    />
                ) : null}

                <Box
                    sx={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        border: "2px solid",
                        borderColor: idle ? "divider" : ringColor,
                        backgroundColor: idle ? "action.hover" : "background.paper",
                        color: idle ? "text.disabled" : ringColor,
                        transition: "border-color .45s ease, color .45s ease, background-color .45s ease",
                        opacity: idle ? 0.6 : 1
                    }}
                >
                    {kind === "judge" ? (
                        <GavelIcon
                            sx={{
                                fontSize: 26,
                                transformOrigin: "80% 80%",
                                animation: active
                                    ? `${weigh} 1.5s ease-in-out infinite`
                                    : done
                                      ? `${strike} .7s cubic-bezier(.3,1.4,.5,1) 1`
                                      : "none",
                                [REDUCED]: { animation: "none" }
                            }}
                        />
                    ) : (
                        <RecordVoiceOverIcon sx={{ fontSize: 26 }} />
                    )}
                </Box>

                {/* the outcome badge */}
                {done || failed ? (
                    <Box
                        sx={{
                            position: "absolute",
                            right: -2,
                            bottom: -2,
                            width: 20,
                            height: 20,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            color: "#fff",
                            backgroundColor: failed ? VERDICT_COLORS.FAILED : ringColor,
                            border: "2px solid",
                            borderColor: "background.paper",
                            animation: `${stampIn} .4s ease-out 1`,
                            [REDUCED]: { animation: "none" }
                        }}
                    >
                        {failed ? <CloseIcon sx={{ fontSize: 13 }} /> : <CheckIcon sx={{ fontSize: 13 }} />}
                    </Box>
                ) : null}
            </Box>

            {/* mid-sentence dots */}
            <Box sx={{ height: 10, mt: 0.5 }}>
                {active
                    ? [0, 1, 2].map(function (index) {
                          return (
                              <Box
                                  key={index}
                                  component="span"
                                  sx={{
                                      display: "inline-block",
                                      width: 4,
                                      height: 4,
                                      mx: "2px",
                                      borderRadius: "50%",
                                      backgroundColor: accent,
                                      animation: `${speak} 1.1s ease-in-out ${index * 0.16}s infinite`,
                                      [REDUCED]: { animation: "none", opacity: 0.5 }
                                  }}
                              />
                          );
                      })
                    : null}
            </Box>

            <Typography
                variant="caption"
                align="center"
                sx={{ fontWeight: 600, lineHeight: 1.25, mt: 0.25 }}
            >
                {name}
            </Typography>
            <Typography
                variant="caption"
                align="center"
                color="text.secondary"
                sx={{ fontSize: 10.5, lineHeight: 1.25 }}
            >
                {subtitle}
            </Typography>

            {/* the verdict, stamped on when it lands */}
            {verdict ? (
                <Typography
                    variant="caption"
                    sx={{
                        mt: 0.5,
                        px: 0.75,
                        fontWeight: 700,
                        fontSize: 10,
                        letterSpacing: ".06em",
                        color: VERDICT_COLORS[verdict],
                        border: "1.5px solid",
                        borderColor: VERDICT_COLORS[verdict],
                        borderRadius: 0.5,
                        animation: `${stampIn} .5s cubic-bezier(.2,1.5,.4,1) 1`,
                        [REDUCED]: { animation: "none", transform: "none" }
                    }}
                >
                    {verdict}
                </Typography>
            ) : null}

            {failed ? (
                <Tooltip title={call.error || ""}>
                    <Typography
                        variant="caption"
                        sx={{ mt: 0.5, color: "error.main", fontSize: 10, cursor: "help" }}
                    >
                        no ruling
                    </Typography>
                </Tooltip>
            ) : null}

            {done && !verdict && call.elapsedMs ? (
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    {formatDuration(call.elapsedMs)}
                </Typography>
            ) : null}
        </Stack>
    );
}

/* ---- the room ---------------------------------------------------------- */

export default function CourtroomScene(props) {
    const calls = props.calls || [];
    const stage = props.stage;

    const byId = {};
    calls.forEach(function (call) {
        byId[call.id] = call;
    });

    const speechesDone = SPEAKERS.every(function (speaker) {
        return byId[speaker.id];
    });
    const benchAwake = stage === "verdicts" || speechesDone;

    const prosecution = SPEAKERS.filter(function (s) {
        return s.role === "Prosecution";
    });
    const defence = SPEAKERS.filter(function (s) {
        return s.role === "Defence";
    });

    function speakerFigure(speaker) {
        return (
            <Figure
                key={speaker.id}
                kind="speaker"
                name={speaker.name.split(" ")[0] + " " + speaker.name.split(" ")[1]}
                subtitle={speaker.title}
                accent={SIDE_COLORS[speaker.role]}
                call={byId[speaker.id]}
                active={stage === "speeches" && !byId[speaker.id]}
            />
        );
    }

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack
                    direction="row"
                    alignItems="baseline"
                    justifyContent="space-between"
                    flexWrap="wrap"
                    gap={1}
                >
                    <Typography variant="h6">
                        {stage === "speeches"
                            ? "The advocates are speaking"
                            : stage === "verdicts"
                              ? "The bench is deliberating"
                              : "The sitting has closed"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {calls.length} of {CALLS_PER_RUN} calls
                    </Typography>
                </Stack>
                <LinearProgress
                    variant="determinate"
                    value={(calls.length / CALLS_PER_RUN) * 100}
                    sx={{ mt: 1, mb: 3, height: 3, borderRadius: 2 }}
                />

                {/* ---- the bench ---- */}
                <Box
                    sx={{
                        position: "relative",
                        borderRadius: 1,
                        px: { xs: 1, sm: 3 },
                        py: 2.5,
                        mb: 1,
                        background:
                            "linear-gradient(180deg, rgba(163,123,44,0.10), rgba(163,123,44,0.02))",
                        border: "1px solid",
                        borderColor: benchAwake ? "secondary.main" : "divider",
                        transition: "border-color .6s ease",
                        opacity: benchAwake ? 1 : 0.55,
                        animation: benchAwake ? `${riseIn} .6s ease-out 1` : "none",
                        [REDUCED]: { animation: "none" }
                    }}
                >
                    <Typography
                        variant="overline"
                        color="text.secondary"
                        sx={{ display: "block", textAlign: "center", mb: 1, fontSize: 10 }}
                    >
                        The bench — each rules alone
                    </Typography>
                    <Stack
                        direction="row"
                        justifyContent="center"
                        flexWrap="wrap"
                        gap={{ xs: 1, sm: 3 }}
                    >
                        {JUDGES.map(function (judge) {
                            return (
                                <Figure
                                    key={judge.id}
                                    kind="judge"
                                    name={judge.name}
                                    subtitle={judge.title}
                                    accent="#a37b2c"
                                    call={byId[judge.id]}
                                    active={stage === "verdicts" && !byId[judge.id]}
                                />
                            );
                        })}
                    </Stack>
                </Box>

                {/* ---- the floor ---- */}
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    gap={2}
                    sx={{ mt: 2 }}
                >
                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="overline"
                            sx={{ color: SIDE_COLORS.Prosecution, fontSize: 10 }}
                        >
                            Prosecution seats
                        </Typography>
                        <Stack direction="row" gap={1} sx={{ mt: 0.5 }}>
                            {prosecution.map(speakerFigure)}
                        </Stack>
                    </Box>

                    <Box
                        sx={{
                            width: "1px",
                            alignSelf: "stretch",
                            backgroundColor: "divider",
                            display: { xs: "none", sm: "block" }
                        }}
                    />

                    <Box sx={{ flex: 1 }}>
                        <Typography
                            variant="overline"
                            sx={{ color: SIDE_COLORS.Defence, fontSize: 10 }}
                        >
                            Defence seats
                        </Typography>
                        <Stack direction="row" gap={1} sx={{ mt: 0.5 }}>
                            {defence.map(speakerFigure)}
                        </Stack>
                    </Box>
                </Stack>

                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", mt: 2.5, textAlign: "center" }}
                >
                    {stage === "speeches"
                        ? "All four are speaking at once — nothing they say depends on each other."
                        : stage === "verdicts"
                          ? "Each judge has all four speeches and rules without seeing the others."
                          : "Seven calls, two waves."}
                </Typography>
            </CardContent>
        </Card>
    );
}
