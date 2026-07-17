# dominoiq-cli

dominoiq-cli is a command-line app for sending prompts to a Domino IQ server using the Domino REST API.

## Requirements

- Domino IQ running on a Domino server
- Domino REST API v1.1.4 or newer
- Node.js 18 or newer

## Install

```bash
npm install -g dominoiq-cli
```

## Start the CLI

```bash
dominoiq-cli
```

## Usage

When the CLI starts, enter slash commands to configure it:

- `/config` sets the Domino REST API URL, for example `http://domino-server.com:8880`
- `/command` sets the Domino IQ `command` to use, for example `StdReplyEmail`
- `/login` prompts for a domino username and password and saves the session
- `/logout` logs out and clears the session
- `/status` shows the current configuration
- `/version` shows the current app version
- `/help` lists all available commands
- `/exit` closes the CLI

### Authentication

To send any prompts to Domino IQ, you first need to log in to the Domino REST API with a valid Domino user. Once logged in, your session will remain until the token issued by Domino REST API expires. You can log out using the `/logout` command to log out of your current session and clear the cached token.

### Quickstart

- use the `/config` command to configure the URL of the Domino REST API
- use the `/command` command to configure the Domino IQ command to use (e.g 'StdReplyEmail')
- use the `/login` command to log in to the Domino REST API

Then type something to send a prompt to Domino IQ and receive a response.

## One-shot usage

You can also submit a single prompt without entering the interactive shell:

```bash
dominoiq-cli --prompt "How are things?"

# use a specific Domino IQ command for one-shot mode
dominoiq-cli --prompt "How are things?" --command StdReplyEmail
```

## Local configuration storage

The CLI stores the Domino REST API URL, default command, and Domino REST API JWT in:

```text
%USERPROFILE%\.dominoiq-cli\config.json
```
