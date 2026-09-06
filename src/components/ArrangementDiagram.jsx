/*
 * ArrangementDiagram.jsx - what the chosen arrangement actually looks like.
 *
 * Two radio buttons cannot show the difference between the two arrangements,
 * because the difference is structural: in one, all seven calls run through a
 * single model and the bench inherits whatever that model is blind to; in the
 * other, the judges sit on a model the advocates never touched. Drawing the
 * wiring makes that visible at a glance, and the card merging or splitting as
 * you switch is the point being made.
 */

import React from "react";
import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GavelIcon from "@mui/icons-material/Gavel";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";

import { CONFIG_SINGLE } from "../constants.js";
import { SPEAKERS, JUDGES } from "../tribunal/personas.js";
import { SIDE_COLORS } from "../theme.js";

// A pulse travelling down the wire, in the direction the work flows.
const flow = keyframes`
  0%   { left: -6px;  opacity: 0; }
  15%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { left: 100%;  opacity: 0; }
`;

const appear = keyframes`
  from { opacity: 0; transform: translateY(-8px) scale(.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
`;

const REDUCED = "@media (prefers-reduced-motion: reduce)";

function Dots(props) {
    return (
        <Stack direction="row" gap={0.5} alignItems="center">
            {Array.from({ length: props.count }).map(function (ignored, index) {
                return (
                    <Box
                        key={index}
                        sx={{
                            width: 26,
                            height: 26,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            border: "1.5px solid",
                            borderColor: props.color,
                            color: props.color,
                            backgroundColor: "background.paper"
                        }}
                    >
                        {props.icon}
                    </Box>
                );
            })}
        </Stack>
    );
}

function Wire(props) {
    return (
        <Box
            sx={{
                position: "relative",
                flexGrow: 1,
                minWidth: 28,
                height: 2,
                borderRadius: 1,
                backgroundColor: props.color,
                opacity: 0.35,
                overflow: "visible"
            }}
        >
            <Box
                sx={{
                    position: "absolute",
                    top: -2,
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: props.color,
                    animation: `${flow} 2.4s linear ${props.delay || 0}s infinite`,
                    [REDUCED]: { animation: "none", display: "none" }
                }}
            />
        </Box>
    );
}

function ModelCard(props) {
    const model = props.model;
    if (!model) {
        return null;
    }
    return (
        <Box
            sx={{
                minWidth: { xs: 0, sm: 190 },
                maxWidth: 240,
                px: 1.5,
                py: 1.25,
                borderRadius: 1,
                border: "1.5px solid",
                borderColor: props.accent,
                backgroundColor: "background.paper",
                animation: `${appear} .4s cubic-bezier(.2,1.3,.4,1) 1`,
                [REDUCED]: { animation: "none" }
            }}
        >
            <Typography variant="caption" sx={{ color: props.accent, fontWeight: 700, fontSize: 10 }}>
                {props.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3, mt: 0.25 }} noWrap>
                {model.name}
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                <Chip
                    size="small"
                    variant="outlined"
                    color={model.isFree ? "success" : "default"}
                    label={model.isFree ? "free" : "paid"}
                    sx={{ height: 18, fontSize: 10 }}
                />
                <Typography variant="caption" color="text.secondary" noWrap sx={{ fontSize: 10 }}>
                    {props.calls} call{props.calls === 1 ? "" : "s"}
                </Typography>
            </Stack>
        </Box>
    );
}

export default function ArrangementDiagram(props) {
    const single = props.config === CONFIG_SINGLE;
    const agentModels = props.agentModels;
    const distinct = props.distinct || 1;

    if (single && !props.singleModel) {
        return null;
    }

    // In B, group the seats by the model they landed on, so the picture shows
    // what the arrangement actually is rather than what it is called: seven
    // seats on two models is a picture of two models.
    const groups = [];
    if (!single && agentModels) {
        const byModel = {};
        SPEAKERS.concat(JUDGES).forEach(function (agent) {
            const model = agentModels[agent.id];
            if (!model) {
                return;
            }
            if (!byModel[model.id]) {
                byModel[model.id] = { model: model, agents: [] };
            }
            byModel[model.id].agents.push(agent);
        });
        Object.keys(byModel).forEach(function (key) {
            groups.push(byModel[key]);
        });
    }

    const anyRouter = single
        ? props.singleModel.isRouter
        : groups.some(function (group) {
              return group.model.isRouter;
          });

    return (
        <Box
            sx={{
                p: { xs: 1.5, sm: 2 },
                borderRadius: 1,
                border: "1px dashed",
                borderColor: "divider",
                backgroundColor: "action.hover"
            }}
        >
            {single ? (
                <Stack direction={{ xs: "column", sm: "row" }} alignItems="stretch" gap={1.5}>
                    <Stack gap={1.5} justifyContent="space-around" sx={{ flexShrink: 0 }}>
                        <Stack direction="row" alignItems="center" gap={1}>
                            <Dots
                                count={4}
                                color={SIDE_COLORS.Prosecution}
                                icon={<RecordVoiceOverIcon sx={{ fontSize: 14 }} />}
                            />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                4 representatives
                            </Typography>
                        </Stack>
                        <Stack direction="row" alignItems="center" gap={1}>
                            <Dots count={3} color="#a37b2c" icon={<GavelIcon sx={{ fontSize: 14 }} />} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                                3 judges
                            </Typography>
                        </Stack>
                    </Stack>
                    <Stack gap={1.5} justifyContent="space-around" sx={{ flexGrow: 1, minWidth: 40, py: 1.5 }}>
                        <Wire color={SIDE_COLORS.Prosecution} delay={0} />
                        <Wire color="#a37b2c" delay={1.2} />
                    </Stack>
                    <Stack justifyContent="center" sx={{ flexShrink: 0 }}>
                        <ModelCard
                            model={props.singleModel}
                            label="ALL SEVEN CALLS"
                            accent="#1f2933"
                            calls={7}
                        />
                    </Stack>
                </Stack>
            ) : (
                <Stack gap={1}>
                    {groups.map(function (group) {
                        const judges = group.agents.filter(function (a) {
                            return !a.role;
                        });
                        const accent = judges.length === group.agents.length
                            ? "#a37b2c"
                            : SIDE_COLORS.Prosecution;
                        return (
                            <Stack
                                key={group.model.id}
                                direction={{ xs: "column", sm: "row" }}
                                alignItems={{ xs: "stretch", sm: "center" }}
                                gap={1}
                            >
                                <Box sx={{ minWidth: { sm: 240 } }}>
                                    <Typography variant="caption" sx={{ fontSize: 10.5 }}>
                                        {group.agents
                                            .map(function (agent) {
                                                return agent.name;
                                            })
                                            .join(" · ")}
                                    </Typography>
                                </Box>
                                <Wire color={accent} delay={0} />
                                <ModelCard
                                    model={group.model}
                                    label={
                                        group.agents.length +
                                        (group.agents.length === 1 ? " SEAT" : " SEATS")
                                    }
                                    accent={accent}
                                    calls={group.agents.length}
                                />
                            </Stack>
                        );
                    })}
                </Stack>
            )}

            {anyRouter ? (
                <Typography
                    variant="caption"
                    sx={{ display: "block", mt: 1.5, lineHeight: 1.5, color: "error.main" }}
                >
                    A router was chosen, not a model. It forwards every call to whichever free
                    model is free at that moment, so calls through it can reach different models
                    each time. Pick a named model to make the arrangement mean anything.
                </Typography>
            ) : null}

            {/*
              * Nothing is said under arrangement A. The picker's own label
              * describes it and the diagram above shows one model on all seven
              * seats, so a caption here would only be repeating what the user
              * is looking at. What is left is the one thing the screen cannot
              * show by itself: how many models seven seats actually reached.
              */}
            {single ? null : (
                <Typography
                    variant="caption"
                    color={distinct === 1 ? "warning.main" : "text.secondary"}
                    sx={{ display: "block", mt: 1.5, lineHeight: 1.5 }}
                >
                    {distinct === 1
                        ? "Every seat is pointed at the same model, so this is arrangement A wearing arrangement B's label."
                        : distinct + " distinct models across seven seats."}
                </Typography>
            )}
        </Box>
    );
}
