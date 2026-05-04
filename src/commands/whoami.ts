import { Command } from "@effect/cli";
import { Effect } from "effect";
import { environmentPrompt } from "../prompts/environment";
import * as Polar from "../services/polar";

export const whoami = Command.make("whoami", {}, () =>
  Effect.gen(function* () {
    const environment = yield* environmentPrompt;
    const polar = yield* Polar.Polar;

    try {
      const user = yield* polar.use((client) => client.users.getAuthenticated(), environment);
      const organizations = yield* polar.use((client) => client.organizations.list({ limit: 100 }), environment);

      const bold = "\x1b[1m";
      const cyan = "\x1b[36m";
      const reset = "\x1b[0m";
      const dim = "\x1b[2m";

      console.log("");
      console.log(`  ${bold}Logged in as:${reset} ${cyan}${user.email}${reset}`);
      console.log(`  ${bold}Environment:${reset}  ${environment}`);
      console.log("");
      
      if (organizations.result.items.length > 0) {
        console.log(`  ${bold}Organizations:${reset}`);
        organizations.result.items.forEach(org => {
          console.log(`    ${dim}•${reset} ${org.name} ${dim}(${org.slug})${reset}`);
        });
      } else {
        console.log(`  ${dim}No organizations found.${reset}`);
      }
      console.log("");
    } catch (error) {
      console.error("\x1b[31mError:\x1b[0m Not logged in or session expired. Run 'polar login' to authenticate.");
    }
  })
);
