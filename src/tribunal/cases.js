/*
 * cases.js - the charge sheets that ship with the application.
 *
 * This lives beside the rest of the court's rules rather than inside a React
 * component, because the canonical case is domain material: the tests read it,
 * the form reads it, and a copy that drifts between the two is exactly how a
 * paraphrase of the question ends up being argued instead of the question.
 */

export const EXAMPLE_CASES = [
    {
        /*
         * Case T-001, from the course's case design dossier. This is the
         * canonical charge sheet for the running project, so it is reproduced
         * rather than paraphrased. The agreed factual record is the part that
         * makes the case arguable: each line is a fact both sides must work
         * with, rather than a conclusion either of them can simply assert.
         *
         * Its question asks whether an act was justified, not whether a person
         * was guilty, so the court answers in that vocabulary.
         */
        label: "T-001 \u00b7 Jon Snow",
        verdictSet: "JUSTIFICATION",
        defendant:
            "Jon Snow \u2014 Case T-001, The Realm v. Jon Snow. Deceased: Daenerys Targaryen.",
        act:
            "ACT ALLEGED\n" +
            "Jon intentionally killed Daenerys by stabbing her during a private " +
            "meeting in the throne room after the fall of King's Landing.\n\n" +
            "BASE PREMISES\n" +
            "The story takes place mainly in Westeros, a continent where powerful " +
            "families compete for the Iron Throne. Jon Snow grows up believing he " +
            "is the illegitimate son of Lord Eddard Stark. He becomes a military " +
            "commander, then King in the North. He later learns that he is the " +
            "lawful son of Rhaegar Targaryen and Lyanna Stark, which gives him a " +
            "stronger hereditary claim to the throne than Daenerys, although he " +
            "does not want to rule.\n\n" +
            "Daenerys Targaryen is the exiled heir of the dynasty that once ruled " +
            "Westeros. She survives abuse, gains three dragons, frees enslaved " +
            "people, and builds an army. Her victories make her both a liberator " +
            "and an increasingly absolute ruler. Jon and Daenerys become allies " +
            "and lovers while fighting the Night King, whose army threatens all " +
            "living people, and Jon pledges loyalty to her. After they defeat the " +
            "dead, Daenerys turns to the Iron Throne. Jon's hidden parentage then " +
            "weakens her political claim and feeds her fear of betrayal.\n\n" +
            "Daenerys attacks King's Landing, the capital held by Queen Cersei " +
            "Lannister. The city surrenders, but Daenerys burns streets and " +
            "civilians from her dragon, Drogon. Jon witnesses the destruction. " +
            "Grey Worm, her commander, joins the killing on the ground. " +
            "Afterward, Daenerys promises further campaigns of liberation. Tyrion " +
            "Lannister, her chief adviser, resigns in protest and is imprisoned. " +
            "He warns Jon that Daenerys will kill anyone who threatens her rule, " +
            "including Jon's sisters. Jon asks Daenerys to show mercy and share " +
            "moral judgment with others. She refuses. During an embrace, he stabs " +
            "her to death. Her soldiers arrest him.\n\n" +
            "AGREED FACTUAL RECORD\n" +
            "- King's Landing had surrendered: its bells rang and organized " +
            "resistance had ceased. Daenerys then used Drogon against streets and " +
            "civilians, causing destruction on a vast scale.\n" +
            "- After the victory, Daenerys told her assembled forces that the " +
            "campaign of liberation would continue beyond King's Landing. Jon had " +
            "seen the city and heard the speech.\n" +
            "- Tyrion Lannister renounced his office as Hand and was imprisoned. " +
            "He warned Jon that Daenerys would treat Jon's sisters, and anyone " +
            "else she regarded as an obstacle, as enemies.\n" +
            "- Jon asked Daenerys to forgive Tyrion and to show mercy. She refused " +
            "to let others choose what was good and presented her own judgment as " +
            "decisive.\n" +
            "- Daenerys was unarmed and was not attacking Jon when he killed her. " +
            "Jon used their intimacy to get close enough to strike. He had not " +
            "convened a council, attempted detention, or sought a public surrender " +
            "of power.",
        question:
            "Was Jon Snow's intentional killing of Daenerys Targaryen justified as " +
            "the necessary defense of others and of the realm, given what he knew, " +
            "the scale of the threatened harm, the absence or presence of safer " +
            "alternatives, and his lack of formal authority?"
    }
];