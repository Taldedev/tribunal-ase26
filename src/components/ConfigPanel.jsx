/*
 * ConfigPanel.jsx - the arrangement, the models, and the budget.
 *
 * The comparison the project exists to make lives on this panel. Arrangement A
 * gives one model all seven calls and lets the system prompts do the whole job
 * of making seven voices. Arrangement B gives every seat its own model, so the
 * personalities are carried by different machines as well as different
 * prompts. Pointing all four representatives at one model and all three judges
 * at another is a special case of B, not a third arrangement.
 *
 * The estimate shown beside the budget is the worst case, not the likely case,
 * because a cap that binds only on the likely case does not bind.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ShuffleIcon from "@mui/icons-material/Shuffle";

import { CONFIG_SINGLE, CONFIG_SPLIT, CONFIG_LABELS, CALLS_PER_RUN } from "../constants.js";
import { SPEAKERS, JUDGES } from "../tribunal/personas.js";
import { SIDE_COLORS } from "../theme.js";
import { formatDuration } from "../lib/money.js";
import { pingModel } from "../tribunal/client.js";
import BudgetScales from "./BudgetScales.jsx";
import RequestQuota from "./RequestQuota.jsx";
import ArrangementDiagram from "./ArrangementDiagram.jsx";

// One row of the model list: the name, then what it costs per million tokens,
// which is the unit these prices are actually readable in.
function ModelOption(props) {
    const model = props.model;
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
            <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                {model.name}
            </Typography>
            {model.isRouter ? (
                <Chip label="router" size="small" color="error" variant="outlined" />
            ) : null}
            {model.isFree ? (
                <Chip label="free" size="small" color="success" variant="outlined" />
            ) : (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    ${(model.promptPrice * 1000000).toFixed(2)} in / $
                    {(model.completionPrice * 1000000).toFixed(2)} out per 1M
                </Typography>
            )}
        </Box>
    );
}

function ModelPicker(props) {
    return (
        <Autocomplete
            options={props.models}
            value={props.value || null}
            onChange={function (event, value) {
                if (value) {
                    props.onChange(value);
                }
            }}
            disabled={props.disabled}
            size="small"
            getOptionLabel={function (model) {
                return model ? model.name : "";
            }}
            isOptionEqualToValue={function (a, b) {
                return a.id === b.id;
            }}
            groupBy={function (model) {
                return model.isFree ? "Free" : "Paid";
            }}
            renderOption={function (optionProps, model) {
                return (
                    <li {...optionProps} key={model.id}>
                        <ModelOption model={model} />
                    </li>
                );
            }}
            renderInput={function (params) {
                return <TextField {...params} label={props.label} size="small" />;
            }}
            sx={{ minWidth: 240, flexGrow: 1 }}
        />
    );
}

// One seat and the model behind it.
function SeatRow(props) {
    const agent = props.agent;
    const accent = props.accent;
    return (
        <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "stretch", sm: "center" }}
            gap={1.5}
            sx={{ py: 0.75 }}
        >
            <Box sx={{ width: { sm: 190 }, flexShrink: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>
                    {agent.name}
                </Typography>
                <Typography variant="caption" sx={{ color: accent, fontSize: 10.5 }}>
                    {props.seat}
                </Typography>
            </Box>
            <ModelPicker
                label="Model"
                models={props.models}
                value={props.value}
                onChange={props.onChange}
                disabled={props.disabled}
            />
        </Stack>
    );
}

/*
 * Tries the chosen models with one eight-token call each.
 *
 * Roughly half the free models on OpenRouter refuse or rate-limit at any
 * moment. Discovering that through a failed deliberation costs four speeches
 * and leaves empty seats on the bench; discovering it here costs nothing.
 */
function ModelTester(props) {
    const [state, setState] = React.useState(null);
    const [busy, setBusy] = React.useState(false);

    const targets = React.useMemo(
        function () {
            const seen = {};
            const list = [];
            props.modelIds.forEach(function (model) {
                if (model && !seen[model.id]) {
                    seen[model.id] = true;
                    list.push(model);
                }
            });
            return list;
        },
        [props.modelIds]
    );

    async function test() {
        setBusy(true);
        setState(null);
        const results = [];
        for (let index = 0; index < targets.length; index += 1) {
            const outcome = await pingModel(targets[index].id);
            results.push({ id: targets[index].id, ...outcome });
        }
        setState(results);
        setBusy(false);
    }

    if (targets.length === 0) {
        return null;
    }

    return (
        <Box sx={{ mt: 2 }}>
            <Button size="small" variant="outlined" onClick={test} disabled={busy || props.disabled}>
                {busy
                    ? "Testing…"
                    : "Test " +
                      (targets.length === 1 ? "this model" : "these " + targets.length + " models")}
            </Button>
            {state ? (
                <Stack gap={0.5} sx={{ mt: 1.5 }}>
                    {state.map(function (result) {
                        return (
                            <Alert
                                key={result.id}
                                severity={result.ok ? "success" : "error"}
                                icon={false}
                                sx={{ py: 0.25 }}
                            >
                                <Typography variant="body2">
                                    <strong>{result.id}</strong> —{" "}
                                    {result.ok
                                        ? "answered in " + formatDuration(result.elapsedMs)
                                        : result.error}
                                </Typography>
                            </Alert>
                        );
                    })}
                </Stack>
            ) : null}
        </Box>
    );
}

export default function ConfigPanel(props) {
    const isSplit = props.config === CONFIG_SPLIT;
    const estimate = props.estimate;

    const agentModels = React.useMemo(
        function () {
            if (!isSplit) {
                return null;
            }
            const map = {};
            SPEAKERS.concat(JUDGES).forEach(function (agent) {
                map[agent.id] = props.perAgentModels[agent.id] || props.singleModel;
            });
            return map;
        },
        [isSplit, props.perAgentModels, props.singleModel]
    );

    const distinct = agentModels
        ? new Set(
              Object.keys(agentModels)
                  .map(function (key) {
                      return agentModels[key] ? agentModels[key].id : null;
                  })
                  .filter(Boolean)
          ).size
        : 1;

    const testTargets = isSplit
        ? Object.keys(agentModels).map(function (key) {
              return agentModels[key];
          })
        : [props.singleModel];

    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="h6">The arrangement</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    {CALLS_PER_RUN} calls either way. What changes is how many models produce them.
                </Typography>

                <RadioGroup
                    value={props.config}
                    onChange={function (event) {
                        props.onConfigChange(event.target.value);
                    }}
                >
                    <FormControlLabel
                        value={CONFIG_SINGLE}
                        control={<Radio size="small" />}
                        disabled={props.disabled}
                        label={
                            <Box>
                                <Typography variant="body2" fontWeight={600}>
                                    {CONFIG_LABELS.SINGLE}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Seven voices out of one model. Only the system prompts differ,
                                    so the panel shares whatever blind spot that model brought.
                                </Typography>
                            </Box>
                        }
                    />
                    <FormControlLabel
                        value={CONFIG_SPLIT}
                        control={<Radio size="small" />}
                        disabled={props.disabled}
                        label={
                            <Box>
                                <Typography variant="body2" fontWeight={600}>
                                    {CONFIG_LABELS.SPLIT}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Every seat gets its own model, so the personalities are carried
                                    by different machines as well as different prompts.
                                </Typography>
                            </Box>
                        }
                    />
                </RadioGroup>

                <Divider sx={{ my: 2 }} />

                {isSplit ? (
                    <Box>
                        <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            flexWrap="wrap"
                            gap={1}
                            sx={{ mb: 1 }}
                        >
                            <Typography variant="subtitle2">
                                A model for each seat
                                <Typography component="span" variant="caption" color="text.secondary">
                                    {" · " + distinct + " distinct across " + CALLS_PER_RUN}
                                </Typography>
                            </Typography>
                            <Button
                                size="small"
                                startIcon={<ShuffleIcon />}
                                onClick={props.onSpreadModels}
                                disabled={props.disabled}
                            >
                                Spread distinct models
                            </Button>
                        </Stack>

                        <Typography variant="overline" sx={{ color: SIDE_COLORS.Prosecution, fontSize: 10 }}>
                            Representatives
                        </Typography>
                        {SPEAKERS.map(function (speaker) {
                            return (
                                <SeatRow
                                    key={speaker.id}
                                    agent={speaker}
                                    seat={speaker.role + " seat"}
                                    accent={SIDE_COLORS[speaker.role]}
                                    models={props.models}
                                    value={agentModels[speaker.id]}
                                    onChange={function (model) {
                                        props.onPerAgentChange(speaker.id, model);
                                    }}
                                    disabled={props.disabled}
                                />
                            );
                        })}

                        <Typography
                            variant="overline"
                            sx={{ color: "#a37b2c", fontSize: 10, mt: 1.5, display: "block" }}
                        >
                            The bench
                        </Typography>
                        {JUDGES.map(function (judge) {
                            return (
                                <SeatRow
                                    key={judge.id}
                                    agent={judge}
                                    seat={judge.title}
                                    accent="#a37b2c"
                                    models={props.models}
                                    value={agentModels[judge.id]}
                                    onChange={function (model) {
                                        props.onPerAgentChange(judge.id, model);
                                    }}
                                    disabled={props.disabled}
                                />
                            );
                        })}

                        {distinct < CALLS_PER_RUN ? (
                            <Alert severity="info" sx={{ mt: 1.5, py: 0.25 }}>
                                <Typography variant="caption">
                                    {distinct} distinct model{distinct === 1 ? "" : "s"} across seven
                                    seats. Seats sharing a model share its habits of reasoning, so a
                                    run with few distinct models is closer to arrangement A than the
                                    label suggests — worth saying in the comparison.
                                </Typography>
                            </Alert>
                        ) : null}
                    </Box>
                ) : (
                    <ModelPicker
                        label="Model for all seven calls"
                        models={props.models}
                        value={props.singleModel}
                        onChange={props.onSingleModelChange}
                        disabled={props.disabled}
                    />
                )}

                {props.catalogueError ? (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        The live model list could not be read ({props.catalogueError}), so the
                        pickers are showing a short built-in list of free models instead.
                    </Alert>
                ) : null}

                <Box sx={{ mt: 2 }}>
                    <ArrangementDiagram
                        config={props.config}
                        singleModel={props.singleModel}
                        agentModels={agentModels}
                        distinct={distinct}
                    />
                </Box>

                <ModelTester modelIds={testTargets} disabled={props.disabled} />

                <Divider sx={{ my: 2 }} />

                <BudgetScales
                    budgetUsd={props.budgetUsd}
                    estimateUsd={estimate ? estimate.worstCaseUsd : 0}
                    onChange={props.onBudgetChange}
                    disabled={props.disabled}
                />

                <Divider sx={{ my: 2 }} />

                <RequestQuota
                    account={props.account}
                    usingFreeModels={testTargets.every(function (model) {
                        return model && model.isFree;
                    })}
                />
            </CardContent>
        </Card>
    );
}
