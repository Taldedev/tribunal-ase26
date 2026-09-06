/*
 * HistoryPanel.jsx - the cases this court has already heard.
 *
 * What this panel receives is a listing, not a set of deliberations. Each row
 * is a summary: when the case was heard, under which arrangement, what the
 * three judges answered, and what it cost. The speeches and the reasoning
 * behind each ruling are not here, because sending four speeches and three
 * reasoned rulings for fifty rows nobody has opened yet is most of a payload
 * spent on nothing. Opening a case reads it in full.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardActions from "@mui/material/CardActions";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

import { CONFIG_LABELS } from "../constants.js";
import { VERDICT_COLORS } from "../theme.js";
import { formatUsd, formatTokens } from "../lib/money.js";

export default function HistoryPanel(props) {
    const cases = props.cases || [];

    /*
     * A record that cannot be reached and a record with nothing in it are two
     * different things, and telling them apart is the whole reason this branch
     * exists. "No case has been heard yet" in front of a database that is
     * simply unreachable is a silent failure wearing an empty state.
     */
    if (props.error) {
        return (
            <Alert severity="warning">
                Past cases could not be read: {props.error}
                <Box component="span" sx={{ display: "block", mt: 1 }}>
                    Deliberations still run. They are simply not being kept, and this list
                    cannot say whether there are any.
                </Box>
            </Alert>
        );
    }

    if (cases.length === 0) {
        return (
            <Alert severity="info">
                No case has been heard yet. Every finished deliberation is stored in the
                court's record, with the log of all seven of its model calls, and listed
                here — from any browser, not only the one that heard it.
            </Alert>
        );
    }

    return (
        <Stack gap={1.5}>
            {cases.map(function (record) {
                return (
                    <Card key={record.runId} variant="outlined">
                        <CardContent sx={{ pb: 1 }}>
                            <Stack
                                direction="row"
                                justifyContent="space-between"
                                alignItems="flex-start"
                                flexWrap="wrap"
                                gap={1}
                            >
                                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                    <Typography variant="subtitle2">
                                        {record.label || "Untitled charge sheet"}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {record.question}
                                    </Typography>
                                </Box>
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ whiteSpace: "nowrap" }}
                                >
                                    {new Date(record.createdAt).toLocaleString()}
                                </Typography>
                            </Stack>

                            {/*
                              * The three answers, kept side by side here as
                              * everywhere else, and an empty seat shown as an
                              * empty seat rather than left out of the row.
                              */}
                            <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
                                {(record.verdicts || []).map(function (verdict, index) {
                                    const color = verdict
                                        ? VERDICT_COLORS[verdict]
                                        : VERDICT_COLORS.FAILED;
                                    return (
                                        <Chip
                                            key={record.runId + "-" + index}
                                            size="small"
                                            variant="outlined"
                                            label={verdict || "no ruling"}
                                            sx={{ color: color, borderColor: color }}
                                        />
                                    );
                                })}
                            </Stack>

                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ mt: 1.5, display: "block" }}
                            >
                                {CONFIG_LABELS[record.config] || record.config} ·{" "}
                                {formatTokens(record.totalTokens)} tokens
                                {record.cachedTokens > 0
                                    ? ", " + formatTokens(record.cachedTokens) + " from cache"
                                    : ""}{" "}
                                · {formatUsd(record.costUsd)}
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button
                                size="small"
                                onClick={function () {
                                    props.onOpen(record.runId);
                                }}
                            >
                                Open this case
                            </Button>
                            <Button
                                size="small"
                                onClick={function () {
                                    props.onReuse(record.runId);
                                }}
                            >
                                Hear it again
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button
                                size="small"
                                color="inherit"
                                startIcon={<DeleteOutlineIcon />}
                                onClick={function () {
                                    props.onDelete(record.runId);
                                }}
                            >
                                Delete
                            </Button>
                        </CardActions>
                    </Card>
                );
            })}
        </Stack>
    );
}
