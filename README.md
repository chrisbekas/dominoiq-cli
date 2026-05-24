# dominoiq-cli

`dominoiq-cli` is a Node.js and TypeScript command-line app for sending prompts to a DominoIQ server through the Domino REST API.

## Requirements

- Node.js 18 or newer

## Install dependencies

```bash
npm install
```

## Run in development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Start the built CLI

```bash
npm start
```

## Interactive commands

When the CLI starts, enter slash commands to configure it:

- `/config` sets the Domino API base URL, for example `http://localhost:8880`
- `/commands` sets the `command` value sent to the completion endpoint, for example `StdReplyEmail`
- `/login` prompts for username and password, then saves the returned JWT locally
- `/status` shows the saved configuration
- `/logout` clears the saved JWT
- `/help` lists the available commands
- `/exit` closes the CLI

Any input that does not start with `/` is sent to:

- `POST {baseUrl}/api/v1/dominoiq/completion`
- JSON body: `{ "command": "<saved command>", "payload": "<your prompt>" }`
- Header: `Authorization: Bearer <saved jwt>`

Login uses:

- `POST {baseUrl}/auth`
- JSON body: `{ "username": "<username>", "password": "<password>" }`

## One-shot usage

You can also submit a single prompt without entering the interactive shell:

```bash
node dist/index.js --prompt "Body of the email to reply to"
```

## Local config storage

The CLI stores the base URL, default command, and JWT in:

```text
%USERPROFILE%\.dominoiq-cli\config.json
```
