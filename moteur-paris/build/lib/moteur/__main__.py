from .cli import main

# Garde indispensable sous Windows : les processus du backtest réimportent ce module.
if __name__ == "__main__":
    raise SystemExit(main())
