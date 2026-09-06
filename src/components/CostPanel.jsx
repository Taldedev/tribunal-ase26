/*
 * CostPanel.jsx - what the run actually cost, in tokens, money and time.
 *
 * Cost is reported per call rather than only as a total, because the shape of
 * the bill is the interesting part: the three judges each read the charge
 * sheet plus all four speeches, so they carry most of the prompt tokens even
 * though there are fewer of them. A single total hides that.
 */

import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from "recharts";

import { formatUsd, formatTokens, formatDuration } from "../lib/money.js";
import { VERDICT_COLORS } from "../theme.js";

function Figure(props) {
    return (
        <Box>
            <Typography variant="overline" color="text.secondary" display="block">
                {props.label}
            </Typography>
            <Typography variant="h5" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                {props.value}
            </Typography>
            {props.note ? (
                <Typography variant="caption" color="text.secondary">
                    {props.note}
                </Typography>
            ) : null}
        </Box>
    );
}

export default function CostPanel(props) {
    const run = props.run;
    const totals = run.totals;

    const chartData = run.calls.map(function (call) {
        return {
            name: call.agent.split(" ").slice(-1)[0],
            role: call.role,
            prompt: call.promptTokens,
            completion: call.completionTokens
        };
    });

    // What the two waves saved against calling the same seven one after
    // another, comparing like with like: both figures are full round trips.
    const saved = totals.sequentialMs - totals.wallMs;

    return (
        <Stack gap={2}>
            <Card variant="outlined">
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        The bill for this deliberation
                    </Typography>
                    <Grid container spacing={3} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <Figure
                                label="Cost"
                                value={formatUsd(totals.costUsd)}
                                note={
                                    totals.costUsd === 0
                                        ? "Every call on a free model"
                                        : "against a cap of " + formatUsd(run.budgetUsd)
                                }
                            />
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <Figure
                                label="Tokens"
                                value={formatTokens(totals.totalTokens)}
                                note={
                                    formatTokens(totals.promptTokens) +
                                    " read · " +
                                    formatTokens(totals.completionTokens) +
                                    " written"
                                }
                            />
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <Figure
                                label="Calls"
                                value={totals.callCount}
                                note={
                                    totals.failedCalls > 0
                                        ? totals.failedCalls + " failed"
                                        : "all seven returned"
                                }
                            />
                        </Grid>
                        <Grid size={{ xs: 6, md: 3 }}>
                            <Figure
                                label="Wall clock"
                                value={formatDuration(totals.wallMs)}
                                note={
                                    saved > 0
                                        ? formatDuration(totals.sequentialMs) + " if run one by one"
                                        : formatDuration(totals.modelMs || 0) + " of model time"
                                }
                            />
                        </Grid>
                    </Grid>

                    {saved > 0 ? (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                The four speeches were called together and the three rulings were
                                called together, which turned{" "}
                                <strong>{formatDuration(totals.sequentialMs)}</strong> of calls into{" "}
                                <strong>{formatDuration(totals.wallMs)}</strong> of waiting. Of that,{" "}
                                <strong>{formatDuration(totals.modelMs || 0)}</strong> was the models
                                actually generating; the rest is network and cold starts, which a
                                sequential run would have paid once per call too. Running in
                                parallel saves time; it never saves a single token.
                            </Typography>
                        </Box>
                    ) : null}
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                        Where the tokens went
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Each judge reads the charge sheet and all four speeches, so the judges
                        carry the prompt tokens even though there are only three of them.
                    </Typography>
                    <Box sx={{ width: "100%", height: 280 }}>
                        <ResponsiveContainer>
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e3e6ea" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} width={56} />
                                <Tooltip
                                    formatter={function (value, name) {
                                        return [formatTokens(value) + " tokens", name];
                                    }}
                                />
                                <Legend />
                                <Bar dataKey="prompt" name="Read" stackId="t" fill="#3f5d7d" />
                                <Bar dataKey="completion" name="Written" fill="#a37b2c" stackId="t" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </CardContent>
            </Card>

            <Card variant="outlined">
                <CardContent sx={{ pb: 0 }}>
                    <Typography variant="subtitle1" gutterBottom>
                        The call log
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Every model call this run made: the model, the outcome, the tokens, the
                        charge and the time. This is the audit trail.
                    </Typography>
                </CardContent>
                <TableContainer sx={{ mt: 1 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Stage</TableCell>
                                <TableCell>Agent</TableCell>
                                <TableCell>Model</TableCell>
                                <TableCell>Outcome</TableCell>
                                <TableCell align="right">Read</TableCell>
                                <TableCell align="right">Written</TableCell>
                                <TableCell align="right">Cost</TableCell>
                                <TableCell align="right">Time</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {run.calls.map(function (call, index) {
                                return (
                                    <TableRow key={call.id + "-" + index}>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {call.stage}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{call.agent}</TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontFamily: "monospace" }}>
                                                {call.modelId}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            {call.ok ? (
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    label={call.verdict || "delivered"}
                                                    sx={
                                                        call.verdict
                                                            ? { color: VERDICT_COLORS[call.verdict] }
                                                            : undefined
                                                    }
                                                />
                                            ) : (
                                                <Chip size="small" color="error" variant="outlined" label="failed" />
                                            )}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {formatTokens(call.promptTokens)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {formatTokens(call.completionTokens)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {formatUsd(call.costUsd)}
                                        </TableCell>
                                        <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                            {formatDuration(call.elapsedMs)}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
                <Divider />
                <Box sx={{ px: 2, py: 1.5 }}>
                    <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        <strong>Total</strong> · {formatTokens(totals.totalTokens)} tokens ·{" "}
                        {formatUsd(totals.costUsd)} · {formatDuration(totals.wallMs)}
                    </Typography>
                </Box>
            </Card>
        </Stack>
    );
}
