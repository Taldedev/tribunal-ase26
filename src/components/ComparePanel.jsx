/*
 * ComparePanel.jsx - arrangement A against arrangement B.
 *
 * Comparing the two arrangements is one of the things the project is for, and
 * it cannot be done inside a single run: the two runs happen minutes apart, so
 * the comparison has to be made from the stored record. Two stored cases are
 * put side by side here, and the question the panel answers is whether
 * splitting the models changed how the bench divided, or only what it cost.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { CONFIG_LABELS, CONFIG_SINGLE } from "../constants.js";
import { VERDICT_COLORS } from "../theme.js";
import { formatUsd, formatTokens, formatDuration } from "../lib/money.js";

function caseLabel(record) {
    const when = new Date(record.createdAt).toLocaleString();
    /*
     * A listing row is a summary, not a case. It carries the label and the
     * question and deliberately not four speeches, so the menu describes a run
     * from what a listing actually has.
     */
    const who = record.label || (record.question || "").slice(0, 48);
    return (record.config === CONFIG_SINGLE ? "A" : "B") + " · " + who + " · " + when;
}

function VerdictStrip(props) {
    return (
        <Stack direction="row" gap={0.75} flexWrap="wrap">
            {props.rulings.map(function (ruling) {
                const color = ruling.ok ? VERDICT_COLORS[ruling.verdict] : VERDICT_COLORS.FAILED;
                return (
                    <Chip
                        key={ruling.judgeId}
                        size="small"
                        variant="outlined"
                        label={
                            ruling.judgeName +
                            ": " +
                            (ruling.ok ? ruling.verdict : "no ruling")
                        }
                        sx={{ color: color, borderColor: color }}
                    />
                );
            })}
        </Stack>
    );
}

function Row(props) {
    return (
        <Stack direction="row" justifyContent="space-between" sx={{ py: 0.75 }}>
            <Typography variant="body2" color="text.secondary">
                {props.label}
            </Typography>
            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {props.value}
            </Typography>
        </Stack>
    );
}

function RunColumn(props) {
    const record = props.record;
    if (!record) {
        return (
            <Card variant="outlined" sx={{ height: "100%" }}>
                <CardContent>
                    <Typography variant="body2" color="text.secondary">
                        Choose a stored case above.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card variant="outlined" sx={{ height: "100%" }}>
            <CardContent>
                <Typography variant="overline" color="text.secondary">
                    {CONFIG_LABELS[record.config] || record.config}
                </Typography>
                <Typography variant="subtitle2" gutterBottom>
                    {record.chargeSheet.defendant}
                </Typography>

                <Box sx={{ my: 1.5 }}>
                    <VerdictStrip rulings={record.rulings} />
                </Box>

                <Divider sx={{ my: 1 }} />
                <Row
                    label="Distinct models"
                    value={(record.distinctModels || 1) + " of 7 seats"}
                />
                <Row
                    label="Models"
                    value={
                        <Typography
                            variant="caption"
                            sx={{ fontFamily: "monospace", display: "block", textAlign: "right" }}
                        >
                            {Array.from(
                                new Set(
                                    Object.keys(record.agentModels || {}).map(function (key) {
                                        return record.agentModels[key].id;
                                    })
                                )
                            ).join("\n")}
                        </Typography>
                    }
                />
                <Divider sx={{ my: 1 }} />
                <Row label="Cost" value={formatUsd(record.totals.costUsd)} />
                <Row label="Tokens" value={formatTokens(record.totals.totalTokens)} />
                <Row label="Wall clock" value={formatDuration(record.totals.wallMs)} />
                <Row
                    label="How it fell"
                    value={
                        record.tally.guilty +
                        " " +
                        (record.tally.positiveWord || "guilty").toLowerCase() +
                        " / " +
                        record.tally.notGuilty +
                        " " +
                        (record.tally.negativeWord || "not guilty").toLowerCase()
                    }
                />
                <Row label="Divided" value={record.tally.split ? "yes" : "no"} />
            </CardContent>
        </Card>
    );
}

export default function ComparePanel(props) {
    const cases = props.cases || [];
    const [leftId, setLeftId] = React.useState("");
    const [rightId, setRightId] = React.useState("");

    // Open on the newest run of each arrangement, which is what the comparison
    // is almost always about.
    React.useEffect(
        function () {
            if (cases.length === 0) {
                return;
            }
            const newestSingle = cases.find(function (record) {
                return record.config === CONFIG_SINGLE;
            });
            const newestSplit = cases.find(function (record) {
                return record.config !== CONFIG_SINGLE;
            });
            setLeftId(function (current) {
                return current || (newestSingle ? newestSingle.runId : cases[0].runId);
            });
            setRightId(function (current) {
                return current || (newestSplit ? newestSplit.runId : "");
            });
        },
        [cases]
    );

    /*
     * The two runs being compared are read in full from the record, because
     * everything this panel shows below the menus - the speeches behind a
     * verdict, the model each seat sat on, the wall clock - is in the case and
     * not in the listing. Two reads for two selections, rather than fifty
     * complete deliberations fetched so that two of them can be looked at.
     */
    const [left, setLeft] = React.useState(null);
    const [right, setRight] = React.useState(null);
    const [loadError, setLoadError] = React.useState(null);
    const loadCase = props.loadCase;

    React.useEffect(
        function () {
            let cancelled = false;
            if (!leftId || !loadCase) {
                setLeft(null);
                return undefined;
            }
            loadCase(leftId).then(function (result) {
                if (cancelled) {
                    return;
                }
                setLeft(result.ok ? result.case : null);
                setLoadError(result.ok ? null : result.error);
            });
            return function () {
                cancelled = true;
            };
        },
        [leftId, loadCase]
    );

    React.useEffect(
        function () {
            let cancelled = false;
            if (!rightId || !loadCase) {
                setRight(null);
                return undefined;
            }
            loadCase(rightId).then(function (result) {
                if (cancelled) {
                    return;
                }
                setRight(result.ok ? result.case : null);
                setLoadError(result.ok ? null : result.error);
            });
            return function () {
                cancelled = true;
            };
        },
        [rightId, loadCase]
    );

    // The comparison is only honest when both runs heard the same case.
    const sameCase =
        left && right && left.chargeSheet.question.trim() === right.chargeSheet.question.trim();

    let finding = null;
    if (left && right && sameCase) {
        const leftPattern = left.rulings
            .map(function (ruling) {
                return ruling.ok ? ruling.verdict : "none";
            })
            .join(",");
        const rightPattern = right.rulings
            .map(function (ruling) {
                return ruling.ok ? ruling.verdict : "none";
            })
            .join(",");
        const costDelta = right.totals.costUsd - left.totals.costUsd;

        finding =
            leftPattern === rightPattern
                ? "Both arrangements produced the same three verdicts on this case. Splitting the models changed the bill and the wall clock, not the outcome."
                : "The two arrangements did not produce the same bench. That is the result worth reporting: on this case, which model rules matters as much as what the prompts say.";

        finding +=
            " Cost moved by " +
            (costDelta === 0 ? "nothing" : formatUsd(Math.abs(costDelta)) + (costDelta > 0 ? " up" : " down")) +
            ".";
    }

    if (cases.length < 2) {
        return (
            <Alert severity="info">
                Run the same charge sheet twice, once on arrangement A and once on arrangement B,
                and both runs will appear here for comparison. There{" "}
                {cases.length === 1 ? "is one stored case" : "are no stored cases"} so far.
            </Alert>
        );
    }

    return (
        <Stack gap={2}>
            {/*
              * A record that would not answer is stated, not swallowed. The
              * panel below would otherwise simply look empty, and an empty
              * comparison reads as "these two runs were identical".
              */}
            {loadError ? (
                <Alert severity="warning">
                    A stored case could not be read back: {loadError}
                </Alert>
            ) : null}

            <Card variant="outlined">
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        One model, or two?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Pick the same charge sheet run under each arrangement. The useful
                        question is not which is cheaper, but whether the bench divided
                        differently once the judges stopped sharing the speakers' model.
                    </Typography>
                    <Stack direction={{ xs: "column", md: "row" }} gap={2}>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="Left"
                            value={leftId}
                            onChange={function (event) {
                                setLeftId(event.target.value);
                            }}
                        >
                            {cases.map(function (record) {
                                return (
                                    <MenuItem key={record.runId} value={record.runId}>
                                        {caseLabel(record)}
                                    </MenuItem>
                                );
                            })}
                        </TextField>
                        <TextField
                            select
                            fullWidth
                            size="small"
                            label="Right"
                            value={rightId}
                            onChange={function (event) {
                                setRightId(event.target.value);
                            }}
                        >
                            {cases.map(function (record) {
                                return (
                                    <MenuItem key={record.runId} value={record.runId}>
                                        {caseLabel(record)}
                                    </MenuItem>
                                );
                            })}
                        </TextField>
                    </Stack>
                </CardContent>
            </Card>

            {left && right && !sameCase ? (
                <Alert severity="warning">
                    These two runs heard different cases, so any difference between them says
                    nothing about the arrangements. Compare two runs of the same charge sheet.
                </Alert>
            ) : null}

            {finding ? <Alert severity="info">{finding}</Alert> : null}

            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <RunColumn record={left} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <RunColumn record={right} />
                </Grid>
            </Grid>
        </Stack>
    );
}
