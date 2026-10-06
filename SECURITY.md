# Security

## Supported use

The dashboard is designed for a trusted LAN reached through an SSH tunnel. Local
accounts with roles, step-up authentication and an audit log are available (see the
security model in `docs/developer-guide.md`) but are optional.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Contact the author privately
through GitHub ([@carminecoppola](https://github.com/carminecoppola)) with a description
and, if possible, the steps to reproduce. You will get an acknowledgement as soon as
possible.

## Hardening checklist for a deployment

- Reach the dashboard only through the SSH tunnel or a private network; do not expose
  port 5000 to the Internet.
- Create the first Admin in **Users & Roles** and turn on sign-in before sharing the
  device with other people.
- Keep `data/auth_users.json` and `data/logs/audit.jsonl` private and backed up.
- Use `EASY_DASHBOARD_ENABLE_AUTH=0` only as the documented emergency way back in.
