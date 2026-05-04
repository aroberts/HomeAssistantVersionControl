import { getAutomationHistory } from './automation-parser.js';
async function test() {
  const r = await getAutomationHistory("automations:automations.yaml:1700684617482", "/tmp/config");
  console.log("HISTORY LENGTH:", r.history?.length);
  if (r.history?.length > 0) {
    console.log("FIRST ALIAS", r.history[0]?.automation?.alias);
    console.log("SECOND ALIAS", r.history[1]?.automation?.alias);
  } else {
    console.log(JSON.stringify(r.debugMessages, null, 2));
  }
}
test();
