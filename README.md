# Web3 Backtest

This repo contains a generic backtester for defi yield farming strategies. 

# Supported AMMs

| Datasource  | Hourly Data | Minute Data |
| ----------- | ----------- | ----------- |
| Univ3       | &check;     | &cross;
| Univ2       | &cross;     | &cross;
| Perp V2     | &cross;      | &cross;
| Joes V2     | &cross;     | &cross;

# Setup

## Influx and Grafana
Grafana and influx are not required to test strategies but they are useful tools for visualising the results. 

Run Grafana and influx locally with docker

```
docker-compose up -d
```

You can stop the grafana and influx containers with 

```
docker-compose down -v
```

## Run a Backtest

Install deps

```
npm install
```

Run the backtest

```
npm run start
```

or if you have ts-node in the PATH

```
ts-node ./src/index.ts
```

# Graphana Vis

Your grafana instance is a fresh instance so there will be no dashboards, you'll need to create them. First step is setting up the influx data source with the following details

| Property | Value
| ----------- | -----------
| name | backtester
| Query Language | InfluxQL 
| URL | http://localhost:8086
| database | backtest
| user | admin
| password | admin

Save & Test

## Create a dashboard to visualise results

Next step is adding creating a dashboard. Import "grafana-dash-example.json" to see an example dashboard. 








