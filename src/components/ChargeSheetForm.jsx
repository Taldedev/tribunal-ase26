/*
 * ChargeSheetForm.jsx - where a case enters the system.
 *
 * The sheet is three fields rather than one free-text box, because the three
 * things a panel actually needs are who is accused, what they are said to have
 * done, and the exact question the court is being asked. A single box makes it
 * far too easy to submit a case that never states its own question, and every
 * agent downstream then guesses at what it is deciding.
 */

import React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { verdictsFor } from "../constants.js";
import { EXAMPLE_CASES } from "../tribunal/cases.js";

export { EXAMPLE_CASES };

// Cases kept ready so the panel can be demonstrated without inventing one on
// the spot. The first is the case the course uses as its canonical example.


// A sheet is only usable when all three parts are actually there. A thin sheet
// does not fail loudly; it produces four confident speeches about nothing.
export function validateChargeSheet(sheet) {
    const problems = [];
    if (!sheet.defendant || sheet.defendant.trim().length < 2) {
        problems.push("Name the defendant.");
    }
    if (!sheet.act || sheet.act.trim().length < 40) {
        problems.push(
            "Describe the act and the case details in at least a few sentences. " +
                "A thin description produces four confident speeches about nothing."
        );
    }
    if (!sheet.question || sheet.question.trim().length < 10) {
        problems.push(
            "State the exact question the court must answer. Without it, each " +
                "judge decides a slightly different case."
        );
    }
    return problems;
}

export default function ChargeSheetForm(props) {
    const sheet = props.chargeSheet;
    const problems = props.showProblems ? validateChargeSheet(sheet) : [];
    const verdicts = verdictsFor(sheet);

    function update(field) {
        return function (event) {
            props.onChange(Object.assign({}, sheet, { [field]: event.target.value }));
        };
    }

    return (
        <Card variant="outlined">
            <CardContent>
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="space-between"
                    flexWrap="wrap"
                    gap={1}
                    sx={{ mb: 2 }}
                >
                    <Box>
                        <Typography variant="h6">The charge sheet</Typography>
                        <Typography variant="body2" color="text.secondary">
                            One decision, put as a precise question. All seven agents read
                            exactly this and nothing else.
                        </Typography>
                    </Box>
                    <Stack direction="row" gap={1} flexWrap="wrap">
                        {EXAMPLE_CASES.map(function (example) {
                            return (
                                <Chip
                                    key={example.label}
                                    label={example.label}
                                    size="small"
                                    variant="outlined"
                                    onClick={function () {
                                        /*
                                         * The label travels with the sheet. It
                                         * is the case's own identifier from the
                                         * dossier - T-001 - and it is what the
                                         * record lists a stored deliberation
                                         * under. Rebuilding the sheet without
                                         * it made every case in the history
                                         * read "Untitled charge sheet", so the
                                         * record could not say which case it
                                         * had heard.
                                         */
                                        props.onChange({
                                            label: example.label,
                                            defendant: example.defendant,
                                            act: example.act,
                                            question: example.question,
                                            verdictSet: example.verdictSet
                                        });
                                    }}
                                />
                            );
                        })}
                    </Stack>
                </Stack>

                <Stack gap={2}>
                    <TextField
                        label="Defendant"
                        value={sheet.defendant}
                        onChange={update("defendant")}
                        fullWidth
                        size="small"
                        placeholder="Who stands accused"
                        disabled={props.disabled}
                    />
                    <TextField
                        label="The act, and the case details"
                        value={sheet.act}
                        onChange={update("act")}
                        fullWidth
                        multiline
                        minRows={7}
                        placeholder="What is alleged to have happened, and everything the court needs in order to weigh it"
                        disabled={props.disabled}
                        helperText={sheet.act.length + " characters"}
                    />
                    <Box>
                        {/* Stated, not chosen. The vocabulary follows the case,
                            and showing it keeps the reader clear on what the
                            bench is about to answer without offering a switch
                            whose other setting is simply wrong here. */}
                        <Typography variant="caption" color="text.secondary" display="block">
                            The court will answer
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {verdicts.positive.toLowerCase()} / {verdicts.negative.toLowerCase()}
                        </Typography>
                    </Box>

                    <TextField
                        label="The exact question before the court"
                        value={sheet.question}
                        onChange={update("question")}
                        fullWidth
                        size="small"
                        placeholder="The single question every judge must answer"
                        disabled={props.disabled}
                    />
                </Stack>

                {problems.length > 0 ? (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                        <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                            {problems.map(function (problem) {
                                return <li key={problem}>{problem}</li>;
                            })}
                        </Stack>
                    </Alert>
                ) : null}

                {props.onClear ? (
                    <Button size="small" sx={{ mt: 2 }} onClick={props.onClear} disabled={props.disabled}>
                        Clear the sheet
                    </Button>
                ) : null}
            </CardContent>
        </Card>
    );
}
