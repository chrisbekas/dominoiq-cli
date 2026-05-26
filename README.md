# dominoiq-cli

`dominoiq-cli` is a node js command-line app for sending prompts to a Domino IQ server through the Domino REST API.

## Requirements

- Domino IQ running on a Domino server
- Domino REST API
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

- `/config` sets the Domino REST API URL, for example `http://localhost:8880`
- `/commands` sets the `command` value sent to the completion endpoint, for example `StdReplyEmail`
- `/login` prompts for a domino username and password and saves the token
- `/status` shows the current  configuration
- `/logout` logs out and clears the session
- `/help` lists all available commands
- `/exit` closes the CLI

### Login to Domino REST API

To send any prompts to Domino IQ, you first need to login to the Domino REST API with a valid Domino user. Once logged in, your session will remain until the token issued by Domino REST API expires. You can also log out using the `/logout` command to log out of your session and clear the cached token.

### Quickstart

- use the `/config` command to configure the URL of the Domino REST API
- use the `/commands` command to configure the Domino IQ command to use (e.g 'StdReplyEmail')
- use the `/login` command to log in to the Domino REST API

Then type something to send a prompt to Domino IQ and receive a response.

## One-shot usage

You can also submit a single prompt without entering the interactive shell:

```bash
node dist/index.js --prompt "How are things?"
```

## Local configuration storage

The CLI stores the Domino REST API URL, default command, and Domino REST API JWT in:

```text
%USERPROFILE%\.dominoiq-cli\config.json
```
