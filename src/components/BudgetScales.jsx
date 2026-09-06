/*
 * BudgetScales.jsx - the run budget, set on a pair of scales.
 *
 * A slider tells you a number. Scales tell you a relationship, and the
 * relationship is the whole point of this control: the run is refused before
 * the first call if what it might cost outweighs what you have allowed. So the
 * left pan carries the budget you set, the right pan carries the worst case
 * this run could reach, and the beam answers the only question that matters
 * before you convene - will this be allowed to run.
 *
 * The tilt is computed from the two real figures. Nothing here is decorative.
 */

import React from "react";
import { keyframes } from "@emotion/react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { formatUsd } from "../lib/money.js";

// The amounts a coin can be worth, smallest first. Twelve stops is enough for
// real control and few enough that every one is a comfortable click target.
export const BUDGET_STEPS = [
    0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5
];

const drop = keyframes`
  0%   { transform: translateY(-14px) scale(.6); opacity: 0; }
  70%  { transform: translateY(2px)  scale(1.06); opacity: 1; }
  100% { transform: translateY(0)    scale(1);   opacity: 1; }
`;

const settle = keyframes`
  0%   { transform: translateY(-9px); opacity: 0; }
  100% { transform: translateY(0);    opacity: 1; }
`;

const REDUCED = "@media (prefers-reduced-motion: reduce)";

const GOLD = "#a37b2c";
const GOLD_LIGHT = "#d8b562";

// Nearest stop to an arbitrary amount, so a value restored from elsewhere
// still lands on a coin.
export function nearestStep(value) {
    let best = 0;
    BUDGET_STEPS.forEach(function (amount, index) {
        if (Math.abs(amount - value) < Math.abs(BUDGET_STEPS[best] - value)) {
            best = index;
        }
    });
    return best;
}

export default function BudgetScales(props) {
    const budget = props.budgetUsd;
    const estimate = props.estimateUsd;
    const disabled = props.disabled;

    const stepIndex = nearestStep(budget);
    const overBudget = estimate > budget;

    /*
     * How far the beam leans. A run that costs nothing leaves the right pan
     * empty and the beam rests fully in favour of the budget; a run that would
     * be refused tips the other way, and the colour changes with it.
     */
    const ratio = budget > 0 ? estimate / budget : 0;
    const angle = Math.max(-12, Math.min(12, (ratio - 1) * 14));
    const radians = (angle * Math.PI) / 180;

    const PIVOT_X = 160;
    const PIVOT_Y = 46;
    const ARM = 96;

    const leftX = PIVOT_X - ARM * Math.cos(radians);
    const leftY = PIVOT_Y - ARM * Math.sin(radians);
    const rightX = PIVOT_X + ARM * Math.cos(radians);
    const rightY = PIVOT_Y + ARM * Math.sin(radians);

    // Coins in the left pan: one per stop chosen, capped so the stack stays
    // inside the bowl.
    const stackCount = Math.min(stepIndex + 1, 7);

    function setStep(index) {
        if (disabled) {
            return;
        }
        const clamped = Math.max(0, Math.min(BUDGET_STEPS.length - 1, index));
        props.onChange(BUDGET_STEPS[clamped]);
    }

    function onKeyDown(event) {
        if (disabled) {
            return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            setStep(stepIndex + 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            setStep(stepIndex - 1);
        } else if (event.key === "Home") {
            event.preventDefault();
            setStep(0);
        } else if (event.key === "End") {
            event.preventDefault();
            setStep(BUDGET_STEPS.length - 1);
        }
    }

    function Pan(props2) {
        return (
            <g>
                <line
                    x1={props2.x}
                    y1={props2.y}
                    x2={props2.x}
                    y2={props2.y + 30}
                    stroke="currentColor"
                    strokeWidth="1"
                    opacity="0.45"
                />
                <path
                    d={
                        "M " + (props2.x - 30) + " " + (props2.y + 30) +
                        " Q " + props2.x + " " + (props2.y + 48) + " " +
                        (props2.x + 30) + " " + (props2.y + 30) + " Z"
                    }
                    fill={props2.fill}
                    stroke={props2.stroke}
                    strokeWidth="1.5"
                />
                {props2.children}
            </g>
        );
    }

    return (
        <Box>
            <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                flexWrap="wrap"
                gap={1}
            >
                <Typography variant="subtitle2">Budget for one run</Typography>
                <Typography
                    variant="h6"
                    sx={{
                        color: overBudget ? "error.main" : GOLD,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1
                    }}
                >
                    {formatUsd(budget)}
                </Typography>
            </Stack>

            {/* ---- the scales ---- */}
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    color: "text.secondary",
                    mt: 0.5
                }}
            >
                <Box
                    component="svg"
                    viewBox="0 0 320 150"
                    role="img"
                    aria-label={
                        "Scales: a budget of " + formatUsd(budget) + " against a worst case of " +
                        formatUsd(estimate) + ". " +
                        (overBudget ? "The run would be refused." : "The run is within budget.")
                    }
                    sx={{ width: "100%", maxWidth: 340, height: "auto", overflow: "visible" }}
                >
                    {/* post and base */}
                    <line x1="160" y1={PIVOT_Y} x2="160" y2="126" stroke="currentColor" strokeWidth="3" opacity="0.55" />
                    <path d="M 128 128 L 192 128 L 184 136 L 136 136 Z" fill="currentColor" opacity="0.35" />

                    {/* the beam, and it moves because the numbers moved */}
                    <g
                        style={{
                            transition: "transform .55s cubic-bezier(.34,1.3,.5,1)",
                            transform: "rotate(" + angle + "deg)",
                            transformOrigin: PIVOT_X + "px " + PIVOT_Y + "px"
                        }}
                    >
                        <line
                            x1={PIVOT_X - ARM}
                            y1={PIVOT_Y}
                            x2={PIVOT_X + ARM}
                            y2={PIVOT_Y}
                            stroke={overBudget ? "#a03038" : GOLD}
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                    </g>
                    <circle cx={PIVOT_X} cy={PIVOT_Y} r="5" fill={overBudget ? "#a03038" : GOLD} />

                    {/* left pan: what you allowed */}
                    <g style={{ transition: "transform .55s cubic-bezier(.34,1.3,.5,1)" }}>
                        <Pan x={leftX} y={leftY} fill="rgba(163,123,44,0.14)" stroke={GOLD}>
                            {Array.from({ length: stackCount }).map(function (ignored, index) {
                                return (
                                    <Box
                                        component="ellipse"
                                        key={index}
                                        cx={leftX}
                                        cy={leftY + 33 - index * 4}
                                        rx={13 - index * 0.6}
                                        ry="3.2"
                                        fill={index % 2 ? GOLD : GOLD_LIGHT}
                                        stroke={GOLD}
                                        strokeWidth="0.6"
                                        sx={{
                                            animation:
                                                index === stackCount - 1
                                                    ? `${drop} .35s ease-out 1`
                                                    : "none",
                                            [REDUCED]: { animation: "none" }
                                        }}
                                    />
                                );
                            })}
                        </Pan>
                        <text
                            x={leftX}
                            y={leftY + 66}
                            textAnchor="middle"
                            fontSize="10"
                            fill="currentColor"
                        >
                            allowed
                        </text>
                    </g>

                    {/* right pan: what the run could cost at worst */}
                    <g style={{ transition: "transform .55s cubic-bezier(.34,1.3,.5,1)" }}>
                        <Pan
                            x={rightX}
                            y={rightY}
                            fill={overBudget ? "rgba(160,48,56,0.16)" : "rgba(0,0,0,0.04)"}
                            stroke={overBudget ? "#a03038" : "currentColor"}
                        >
                            {estimate > 0 ? (
                                <Box
                                    component="rect"
                                    x={rightX - 11}
                                    y={rightY + 20}
                                    width="22"
                                    height="14"
                                    rx="2"
                                    fill={overBudget ? "#a03038" : "#6d7683"}
                                    sx={{
                                        animation: `${settle} .35s ease-out 1`,
                                        [REDUCED]: { animation: "none" }
                                    }}
                                />
                            ) : null}
                        </Pan>
                        <text
                            x={rightX}
                            y={rightY + 66}
                            textAnchor="middle"
                            fontSize="10"
                            fill="currentColor"
                        >
                            {estimate > 0 ? "worst case" : "free models"}
                        </text>
                    </g>
                </Box>
            </Box>

            {/* ---- the coins you set it with ---- */}
            <Box
                role="slider"
                tabIndex={disabled ? -1 : 0}
                aria-label="Budget for one run"
                aria-valuemin={BUDGET_STEPS[0]}
                aria-valuemax={BUDGET_STEPS[BUDGET_STEPS.length - 1]}
                aria-valuenow={budget}
                aria-valuetext={formatUsd(budget)}
                onKeyDown={onKeyDown}
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    gap: { xs: 0.25, sm: 0.5 },
                    mt: 1,
                    py: 1,
                    borderRadius: 1,
                    outline: "none",
                    cursor: disabled ? "default" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    "&:focus-visible": { boxShadow: "0 0 0 2px " + GOLD }
                }}
            >
                {BUDGET_STEPS.map(function (amount, index) {
                    const chosen = index <= stepIndex;
                    const isCurrent = index === stepIndex;
                    const size = 14 + index * 1.4;
                    return (
                        <Box
                            key={amount}
                            component="button"
                            type="button"
                            disabled={disabled}
                            title={formatUsd(amount)}
                            aria-label={"Set budget to " + formatUsd(amount)}
                            onClick={function () {
                                setStep(index);
                            }}
                            sx={{
                                p: 0,
                                border: "1.5px solid",
                                borderColor: chosen ? GOLD : "divider",
                                backgroundColor: chosen
                                    ? index % 2
                                        ? GOLD
                                        : GOLD_LIGHT
                                    : "transparent",
                                width: size,
                                height: size,
                                borderRadius: "50%",
                                cursor: disabled ? "default" : "pointer",
                                transition: "transform .2s ease, background-color .3s ease, border-color .3s ease",
                                transform: isCurrent ? "scale(1.28)" : "scale(1)",
                                boxShadow: isCurrent ? "0 0 0 3px rgba(163,123,44,.18)" : "none",
                                "&:hover": { transform: disabled ? "none" : "scale(1.22)" },
                                [REDUCED]: { transition: "none" }
                            }}
                        />
                    );
                })}
            </Box>

            <Typography
                variant="caption"
                align="center"
                sx={{
                    display: "block",
                    color: overBudget ? "error.main" : "text.secondary",
                    minHeight: 32
                }}
            >
                {overBudget
                    ? "This run would be refused before the first call — worst case " +
                      formatUsd(estimate) +
                      " against " +
                      formatUsd(budget) +
                      ". Choose cheaper models or add a coin."
                    : estimate === 0
                      ? "Every call is on a free model, so the right pan is empty and this run costs nothing."
                      : "Worst case " +
                        formatUsd(estimate) +
                        ", comfortably inside " +
                        formatUsd(budget) +
                        ". The real charge is normally well under it."}
            </Typography>
        </Box>
    );
}
