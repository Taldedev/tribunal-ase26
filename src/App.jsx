/*
 * App.jsx - the tribunal itself.
 *
 * The screen follows the shape of one deliberation. A charge sheet is written
 * and an arrangement chosen, seven calls are made in two waves, and then the
 * opinion, the protocol and the bill are all available for the same run.
 * Nothing is merged and nothing is thrown away: the speeches, the rulings and
 * the call log are kept together, because separately none of them is the
 * record of what happened.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import BalanceIcon from "@mui/icons-material/Balance";
import GavelIcon from "@mui/icons-material/Gavel";

import {
    CONFIG_SINGLE,
    CONFIG_SPLIT,
    DEFAULT_BUDGET_USD,
    DATABASE_NAME,
    DATABASE_VERSION,
    DEFAULT_VERDICT_SET
} from "./constants.js";
import { loadModels, loadAccount } from "./tribunal/client.js";
import { pickDefaultModels, assignDistinctModels } from "./tribunal/modelChoice.js";
import { planRun, runCase } from "./tribunal/runCase.js";
import { openCasesDB } from "./lib/casesDb.js";
import { SPEAKERS, JUDGES } from "./tribunal/personas.js";
import { formatUsd } from "./lib/money.js";

import ChargeSheetForm, { validateChargeSheet } from "./components/ChargeSheetForm.jsx";
import ConfigPanel from "./components/ConfigPanel.jsx";
import CourtroomScene from "./components/CourtroomScene.jsx";
import VerdictsPanel from "./components/VerdictsPanel.jsx";
import SpeechesPanel from "./components/SpeechesPanel.jsx";
import ProtocolPanel from "./components/ProtocolPanel.jsx";
import CostPanel from "./components/CostPanel.jsx";
import ComparePanel from "./components/ComparePanel.jsx";
import HistoryPanel from "./components/HistoryPanel.jsx";

const EMPTY_SHEET = { defendant: "", act: "", question: "", verdictSet: DEFAULT_VERDICT_SET };

const TABS = ["The case", "The opinion", "The bill", "Compare", "Past cases"];

export default function App() {
    const [tab, setTab] = useState(0);

    const [chargeSheet, setChargeSheet] = useState(EMPTY_SHEET);
    const [showProblems, setShowProblems] = useState(false);

    const [models, setModels] = useState([]);
    const [catalogueError, setCatalogueError] = useState(null);
    const [account, setAccount] = useState(null);
    const [singleModel, setSingleModel] = useState(null);
    const [perAgentModels, setPerAgentModels] = useState({});

    const [config, setConfig] = useState(CONFIG_SINGLE);
    const [budgetUsd, setBudgetUsd] = useState(DEFAULT_BUDGET_USD);

    const [running, setRunning] = useState(false);
    const [stage, setStage] = useState(null);
    const [liveCalls, setLiveCalls] = useState([]);

    const [run, setRun] = useState(null);
    const [runError, setRunError] = useState(null);

    const [database, setDatabase] = useState(null);
    const [cases, setCases] = useState([]);
    const [message, setMessage] = useState("");

    // ---- the model catalogue ---------------------------------------------
    useEffect(function () {
        let cancelled = false;
        loadModels().then(function (result) {
            if (cancelled) {
                return;
            }
            setModels(result.models);
            setCatalogueError(result.ok ? null : result.error);

            // Open on free models, since the brief asks for the cheapest run
            // possible, and on two from different providers so arrangement B
            // is a real split rather than the same lab chosen twice.
            const defaults = pickDefaultModels(result.models);
            setSingleModel(defaults.speakerModel);

            // Arrangement B opens with distinct models already spread across
            // the seats, so switching to it shows what it is for.
            const ids = SPEAKERS.concat(JUDGES).map(function (agent) {
                return agent.id;
            });
            setPerAgentModels(assignDistinctModels(result.models, ids));
        });
        return function () {
            cancelled = true;
        };
    }, []);

    // What the key is allowed to do. A failure here is silent: the panel falls
    // back to stating the request cost of a run without the account figures.
    useEffect(function () {
        let cancelled = false;
        loadAccount().then(function (result) {
            if (!cancelled && result.ok) {
                setAccount(result.account);
            }
        });
        return function () {
            cancelled = true;
        };
    }, []);

    // ---- the case store ---------------------------------------------------
    const refreshCases = useCallback(
        async function (db) {
            const target = db || database;
            if (!target) {
                return;
            }
            const rows = await target.getAllCases();
            setCases(rows);
        },
        [database]
    );

    useEffect(function () {
        let cancelled = false;
        openCasesDB(DATABASE_NAME, DATABASE_VERSION)
            .then(async function (db) {
                if (cancelled) {
                    return;
                }
                setDatabase(db);
                const rows = await db.getAllCases();
                if (!cancelled) {
                    setCases(rows);
                }
            })
            .catch(function (error) {
                setMessage("Past cases are unavailable: " + error.message);
            });
        return function () {
            cancelled = true;
        };
    }, []);

    // ---- the estimate shown beside the budget -----------------------------
    const estimate = useMemo(
        function () {
            if (!singleModel) {
                return null;
            }
            return planRun(chargeSheet, config, singleModel, perAgentModels);
        },
        [chargeSheet, config, singleModel, perAgentModels]
    );

    const problems = validateChargeSheet(chargeSheet);
    const canRun = problems.length === 0 && singleModel !== null && !running;

    async function startRun() {
        if (problems.length > 0) {
            setShowProblems(true);
            setMessage("The charge sheet is not ready.");
            return;
        }

        setRunning(true);
        setRunError(null);
        setRun(null);
        setLiveCalls([]);
        setStage("speeches");
        setTab(1);

        const result = await runCase({
            chargeSheet: chargeSheet,
            config: config,
            singleModel: singleModel,
            perAgentModels: perAgentModels,
            budgetUsd: budgetUsd,
            onProgress: function (event) {
                if (event.type === "call") {
                    setLiveCalls(event.calls);
                }
                if (event.type === "stage" && event.status === "started") {
                    setStage(event.stage);
                }
            }
        });

        setRunning(false);
        setStage(null);

        if (result.refused) {
            setRunError(result.error);
            setTab(0);
            return;
        }

        setRun(result);

        if (!result.ok) {
            setRunError(result.error);
            return;
        }

        if (database) {
            try {
                await database.addCase(result);
                await refreshCases(database);
            } catch (error) {
                setMessage("The case could not be stored: " + error.message);
            }
        }

        setMessage(
            result.tally.split
                ? "The panel divided."
                : result.tally.failed > 0
                  ? "The sitting finished with " + result.tally.failed + " seat(s) empty."
                  : "The panel was unanimous."
        );
    }

    async function deleteCase(runId) {
        if (!database) {
            return;
        }
        await database.deleteCase(runId);
        await refreshCases(database);
        setMessage("Case deleted.");
    }

    const hasOpinion = run && run.rulings && run.rulings.length > 0;

    return (
        <Box sx={{ minHeight: "100vh", pb: 8 }}>
            <AppBar position="static" elevation={0}>
                <Toolbar>
                    <BalanceIcon sx={{ mr: 1.5 }} />
                    <Box sx={{ flexGrow: 1 }}>
                        <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                            Tribunal
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.75 }}>
                            Four representatives address it. Three judges rule on it, alone.
                            You weigh them.
                        </Typography>
                    </Box>
                    <Chip
                        size="small"
                        label={models.length + " models available"}
                        sx={{ bgcolor: "rgba(255,255,255,0.16)", color: "#fff" }}
                    />
                </Toolbar>
                <Tabs
                    value={tab}
                    onChange={function (event, value) {
                        setTab(value);
                    }}
                    textColor="inherit"
                    indicatorColor="secondary"
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ px: 2, bgcolor: "primary.dark" }}
                >
                    {TABS.map(function (label) {
                        return <Tab key={label} label={label} />;
                    })}
                </Tabs>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 3 }}>
                {/* ---------------- the case ---------------- */}
                {tab === 0 ? (
                    <Stack gap={2}>
                        {runError ? <Alert severity="error">{runError}</Alert> : null}

                        <ChargeSheetForm
                            chargeSheet={chargeSheet}
                            onChange={function (sheet) {
                                setChargeSheet(sheet);
                                setShowProblems(false);
                            }}
                            onClear={function () {
                                setChargeSheet(EMPTY_SHEET);
                            }}
                            showProblems={showProblems}
                            disabled={running}
                        />

                        <ConfigPanel
                            config={config}
                            onConfigChange={setConfig}
                            models={models}
                            singleModel={singleModel}
                            perAgentModels={perAgentModels}
                            onSingleModelChange={setSingleModel}
                            onPerAgentChange={function (agentId, model) {
                                setPerAgentModels(function (current) {
                                    return Object.assign({}, current, { [agentId]: model });
                                });
                            }}
                            onSpreadModels={function () {
                                const ids = SPEAKERS.concat(JUDGES).map(function (agent) {
                                    return agent.id;
                                });
                                setPerAgentModels(assignDistinctModels(models, ids));
                            }}
                            budgetUsd={budgetUsd}
                            onBudgetChange={setBudgetUsd}
                            estimate={estimate}
                            catalogueError={catalogueError}
                            account={account}
                            disabled={running}
                        />

                        <Box>
                            <Button
                                variant="contained"
                                size="large"
                                startIcon={<GavelIcon />}
                                onClick={startRun}
                                disabled={!canRun}
                            >
                                {running ? "The panel is sitting…" : "Convene the tribunal"}
                            </Button>
                            {estimate ? (
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                                    seven calls · worst case {formatUsd(estimate.worstCaseUsd)}
                                </Typography>
                            ) : null}
                        </Box>
                    </Stack>
                ) : null}

                {/* ---------------- the opinion ---------------- */}
                {tab === 1 ? (
                    <Stack gap={3}>
                        {running ? <CourtroomScene calls={liveCalls} stage={stage} /> : null}

                        {runError && !running ? <Alert severity="error">{runError}</Alert> : null}

                        {!running && !hasOpinion && !runError ? (
                            <Alert severity="info">
                                No sitting yet. Write a charge sheet on the first tab and convene
                                the tribunal.
                            </Alert>
                        ) : null}

                        {hasOpinion ? (
                            <React.Fragment>
                                <Box>
                                    <Typography variant="overline" color="text.secondary">
                                        The question before the court
                                    </Typography>
                                    <Typography variant="h6" sx={{ maxWidth: "62ch" }}>
                                        {run.chargeSheet.question}
                                    </Typography>
                                </Box>

                                <VerdictsPanel rulings={run.rulings} tally={run.tally} />
                                <Divider />
                                <SpeechesPanel speeches={run.speeches} />
                                <ProtocolPanel run={run} />
                            </React.Fragment>
                        ) : null}
                    </Stack>
                ) : null}

                {/* ---------------- the bill ---------------- */}
                {tab === 2 ? (
                    run && run.totals ? (
                        <CostPanel run={run} />
                    ) : (
                        <Alert severity="info">
                            The bill appears once a sitting has finished.
                        </Alert>
                    )
                ) : null}

                {/* ---------------- compare ---------------- */}
                {tab === 3 ? <ComparePanel cases={cases} /> : null}

                {/* ---------------- past cases ---------------- */}
                {tab === 4 ? (
                    <HistoryPanel
                        cases={cases}
                        onOpen={function (record) {
                            setRun(record);
                            setRunError(null);
                            setTab(1);
                        }}
                        onReuse={function (sheet) {
                            setChargeSheet(sheet);
                            setTab(0);
                            setMessage("Charge sheet loaded. Choose an arrangement and convene.");
                        }}
                        onDelete={deleteCase}
                    />
                ) : null}
            </Container>

            <Snackbar
                open={message !== ""}
                autoHideDuration={4000}
                onClose={function () {
                    setMessage("");
                }}
                message={message}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
}
