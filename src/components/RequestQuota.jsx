/*
 * RequestQuota.jsx - the other limit.
 *
 * The scales next to this measure a run in dollars, and on free models that
 * figure is zero. It is also not the limit that stops you. Free models are
 * rationed by requests per day, so a run can be reported as costing nothing
 * right up to the moment it is refused for a quota the screen never mentioned.
 * That happened, and this is the fix: the number that actually binds, stated
 * beside the one that does not.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { CALLS_PER_RUN } from "../constants.js";
import { formatUsd } from "../lib/money.js";

export default function RequestQuota(props) {
    const account = props.account;
    const usingFreeModels = props.usingFreeModels;

    // Without the account figures the request cost of a run is still worth
    // stating, because it is the part people are surprised by.
    if (!account) {
        return (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                One deliberation is <strong>{CALLS_PER_RUN} requests</strong>, not one. On free
                models the limit that binds is requests per day, not dollars.
            </Typography>
        );
    }

    const perDay = account.freeRequestsPerDay;
    const runsPerDay = Math.floor(perDay / CALLS_PER_RUN);
    const credit = account.creditRemainingUsd;

    if (!usingFreeModels) {
        return (
            <Stack gap={0.5}>
                <Typography variant="caption" color="text.secondary">
                    One deliberation is <strong>{CALLS_PER_RUN} requests</strong>. Paid models are
                    not rationed by request count, so the budget beside this is the limit that
                    binds.
                </Typography>
                {typeof credit === "number" ? (
                    <Typography variant="caption" color="text.secondary">
                        Credit remaining: <strong>{formatUsd(credit)}</strong>
                    </Typography>
                ) : null}
            </Stack>
        );
    }

    return (
        <Box>
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="baseline"
                flexWrap="wrap"
                gap={1}
            >
                <Typography variant="caption" color="text.secondary">
                    One deliberation is <strong>{CALLS_PER_RUN} requests</strong>, not one
                </Typography>
                <Typography variant="caption" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    <strong>~{runsPerDay}</strong> run{runsPerDay === 1 ? "" : "s"} a day
                </Typography>
            </Stack>

            {/* Seven requests drawn against the day's allowance, so the size of
                one run against the ration is visible rather than described. */}
            <Stack direction="row" gap={0.4} sx={{ mt: 0.75 }}>
                {Array.from({ length: Math.min(runsPerDay, 24) }).map(function (ignored, index) {
                    return (
                        <Box
                            key={index}
                            sx={{
                                flex: 1,
                                height: 6,
                                borderRadius: 0.5,
                                backgroundColor: index === 0 ? "secondary.main" : "action.selected"
                            }}
                        />
                    );
                })}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                each block is one deliberation · the first is the run you are about to make
            </Typography>

            {account.isFreeTier ? (
                <Alert severity="info" sx={{ mt: 1, py: 0.25 }}>
                    <Typography variant="caption">
                        This key is on the free tier: about <strong>{perDay} free-model requests
                        a day</strong> shared by everyone using it, so roughly{" "}
                        <strong>{runsPerDay} deliberations</strong>. Adding{" "}
                        <strong>{formatUsd(account.unlockThresholdUsd)}</strong> of credit raises
                        it to 1,000 a day — about 140 runs — and unlocks paid models that are not
                        rationed at all.
                    </Typography>
                </Alert>
            ) : null}
        </Box>
    );
}
