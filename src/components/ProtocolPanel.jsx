/*
 * ProtocolPanel.jsx - the protocol of the sitting.
 *
 * This is the record the specification asks for: for each judge, how the
 * decision was reached and what was said. It is also the audit trail, so it
 * carries the model that produced each ruling and can be copied or saved as
 * one document. A record that only exists on a screen is not a record.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";

import { CONFIG_LABELS, CALLS_PER_RUN } from "../constants.js";
import { SPEAKERS, JUDGES } from "../tribunal/personas.js";
import { VERDICT_COLORS } from "../theme.js";
import { formatUsd, formatTokens, formatDuration } from "../lib/money.js";

// Renders the whole sitting as plain text, for copying into a report or
// keeping outside the browser.
export function renderProtocolText(run) {
    const lines = [];
    lines.push("PROTOCOL OF THE TRIBUNAL");
    lines.push("========================");
    lines.push("Case: " + run.runId);
    lines.push("Sat: " + new Date(run.createdAt).toLocaleString());
    lines.push("Arrangement: " + (CONFIG_LABELS[run.config] || run.config));
    lines.push(
        "Distinct models used: " + (run.distinctModels || 1) + " across " + CALLS_PER_RUN + " calls"
    );
    SPEAKERS.concat(JUDGES).forEach(function (agent) {
        const model = run.agentModels ? run.agentModels[agent.id] : null;
        lines.push("  " + agent.name.padEnd(22) + (model ? model.id : "unknown"));
    });
    lines.push("");
    lines.push("THE CHARGE SHEET");
    lines.push("Defendant: " + run.chargeSheet.defendant);
    lines.push("");
    lines.push("The act and the case details:");
    lines.push(run.chargeSheet.act);
    lines.push("");
    lines.push("The exact question before the court:");
    lines.push(run.chargeSheet.question);
    lines.push("");
    lines.push("THE SPEECHES");
    run.speeches.forEach(function (speech) {
        lines.push("");
        lines.push("-- " + speech.speakerName + " (" + speech.role + " · " + speech.speakerTitle + ")");
        lines.push(speech.ok ? speech.text : "NOT DELIVERED. " + speech.error);
    });
    lines.push("");
    lines.push("THE RULINGS");
    run.rulings.forEach(function (ruling) {
        lines.push("");
        lines.push("-- " + ruling.judgeName + " (" + ruling.judgeTitle + ")");
        if (!ruling.ok) {
            lines.push("NO RULING. " + ruling.problem);
            return;
        }
        lines.push("VERDICT: " + ruling.verdict);
        if (typeof ruling.confidence === "number") {
            lines.push("CONFIDENCE: " + ruling.confidence);
        }
        lines.push("REASONS:");
        ruling.reasons.forEach(function (reason) {
            lines.push("  - " + reason);
        });
        if (ruling.decisive) {
            lines.push("MOVED MOST BY: " + ruling.decisive);
        }
        lines.push("HOW THE DECISION WAS REACHED:");
        lines.push(ruling.reasoning);
    });
    lines.push("");
    lines.push("THE COUNT");
    lines.push(
        run.tally.guilty +
            " " +
            (run.tally.positiveWord || "guilty").toLowerCase() +
            ", " +
            run.tally.notGuilty +
            " " +
            (run.tally.negativeWord || "not guilty").toLowerCase() +
            ", " +
            run.tally.failed +
            " seat(s) empty. The verdicts are not merged."
    );
    lines.push("");
    lines.push("THE CALL LOG");
    run.calls.forEach(function (call) {
        lines.push(
            [
                call.stage,
                call.agent,
                call.modelId,
                call.ok ? "ok" : "FAILED",
                call.verdict || "-",
                call.promptTokens + " in",
                call.completionTokens + " out",
                formatUsd(call.costUsd),
                formatDuration(call.elapsedMs)
            ].join(" | ")
        );
    });
    lines.push("");
    lines.push(
        "TOTAL: " +
            formatTokens(run.totals.totalTokens) +
            " tokens across " +
            run.totals.callCount +
            " calls, " +
            formatUsd(run.totals.costUsd) +
            ", " +
            formatDuration(run.totals.wallMs) +
            " wall clock."
    );
    return lines.join("\n");
}

function JudgeRecord(props) {
    const ruling = props.ruling;
    const color = ruling.ok ? VERDICT_COLORS[ruling.verdict] : VERDICT_COLORS.FAILED;

    return (
        <Box sx={{ mb: 3 }}>
            <Stack direction="row" alignItems="baseline" gap={1} flexWrap="wrap">
                <Typography variant="subtitle1" fontWeight={600}>
                    {ruling.judgeName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                    {ruling.judgeTitle} · {ruling.modelId}
                </Typography>
            </Stack>

            {ruling.ok ? (
                <Box>
                    <Typography variant="subtitle2" sx={{ color: color, mt: 0.5 }}>
                        Ruled {ruling.verdict}
                        {typeof ruling.confidence === "number"
                            ? " at confidence " + ruling.confidence
                            : ""}
                        {ruling.decisive ? ", moved most by " + ruling.decisive : ""}
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ mt: 1, whiteSpace: "pre-wrap", lineHeight: 1.7, maxWidth: "68ch" }}
                    >
                        {ruling.reasoning}
                    </Typography>
                    <Stack component="ol" sx={{ mt: 1, mb: 0, pl: 2.5 }} gap={0.5}>
                        {ruling.reasons.map(function (reason, index) {
                            return (
                                <Typography component="li" variant="body2" key={index} color="text.secondary">
                                    {reason}
                                </Typography>
                            );
                        })}
                    </Stack>
                </Box>
            ) : (
                <Alert severity="error" sx={{ mt: 1 }}>
                    <Typography variant="body2" gutterBottom>
                        {ruling.problem}
                    </Typography>
                    {ruling.raw ? (
                        <Box
                            component="pre"
                            sx={{
                                mt: 1,
                                p: 1,
                                maxHeight: 220,
                                overflow: "auto",
                                backgroundColor: "action.hover",
                                fontSize: 12,
                                whiteSpace: "pre-wrap",
                                borderRadius: 1
                            }}
                        >
                            {ruling.raw}
                        </Box>
                    ) : null}
                    <Typography variant="caption" color="text.secondary">
                        Kept in the record exactly as returned, so the failure can be read
                        rather than guessed at.
                    </Typography>
                </Alert>
            )}
        </Box>
    );
}

export default function ProtocolPanel(props) {
    const run = props.run;
    const [copied, setCopied] = React.useState(false);

    function copyProtocol() {
        navigator.clipboard.writeText(renderProtocolText(run)).then(function () {
            setCopied(true);
            setTimeout(function () {
                setCopied(false);
            }, 2000);
        });
    }

    function downloadProtocol() {
        const blob = new Blob([renderProtocolText(run)], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = run.runId + "-protocol.txt";
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="flex-start"
                    flexWrap="wrap"
                    gap={1}
                    sx={{ mb: 2 }}
                >
                    <Box>
                        <Typography variant="h6">Protocol of the sitting</Typography>
                        <Typography variant="body2" color="text.secondary">
                            How each judge reached the decision, and what was said.
                        </Typography>
                    </Box>
                    <Stack direction="row" gap={1}>
                        <Button
                            size="small"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyProtocol}
                            variant="outlined"
                        >
                            {copied ? "Copied" : "Copy"}
                        </Button>
                        <Button
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={downloadProtocol}
                            variant="outlined"
                        >
                            Save
                        </Button>
                    </Stack>
                </Stack>

                <Divider sx={{ mb: 2 }} />

                {run.rulings.map(function (ruling) {
                    return <JudgeRecord key={ruling.judgeId} ruling={ruling} />;
                })}
            </CardContent>
        </Card>
    );
}
