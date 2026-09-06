/*
 * HistoryPanel.jsx - the cases this court has already heard.
 *
 * Every finished run is stored in full, so a past case can be opened and read
 * again rather than re-argued at the cost of another seven calls.
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

    if (cases.length === 0) {
        return (
            <Alert severity="info">
                No case has been heard yet. Finished deliberations are stored in this browser
                and listed here.
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
                                        {record.chargeSheet.defendant}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {record.chargeSheet.question}
                                    </Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                                    {new Date(record.createdAt).toLocaleString()}
                                </Typography>
                            </Stack>

                            <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
                                {record.rulings.map(function (ruling) {
                                    const color = ruling.ok
                                        ? VERDICT_COLORS[ruling.verdict]
                                        : VERDICT_COLORS.FAILED;
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

                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: "block" }}>
                                {CONFIG_LABELS[record.config] || record.config} ·{" "}
                                {formatTokens(record.totals.totalTokens)} tokens ·{" "}
                                {formatUsd(record.totals.costUsd)}
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button size="small" onClick={function () { props.onOpen(record); }}>
                                Open this case
                            </Button>
                            <Button size="small" onClick={function () { props.onReuse(record.chargeSheet); }}>
                                Hear it again
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button
                                size="small"
                                color="inherit"
                                startIcon={<DeleteOutlineIcon />}
                                onClick={function () { props.onDelete(record.runId); }}
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
