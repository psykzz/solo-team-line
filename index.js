const promisify =  require('util').promisify;
const RiotRequest = require('riot-lol-api');

RiotRequest.prototype.request = promisify(RiotRequest.prototype.request);
var api = new RiotRequest(process.env.RIOT_API_KEY);

const MILLISECONDS = 1000;
const FIVE_MINUTES = 5 * 60 * MILLISECONDS;


function precisionRound(number, precision) {
  var factor = Math.pow(10, precision);
  return Math.round(number * factor) / factor;
}
function weightedMean(weightedValues) {
    var totalWeight = weightedValues.reduce(function (sum, weightedValue) {
        return sum + weightedValue[1];
    }, 0);

    return weightedValues.reduce(function (mean, weightedValue) {
        return mean + weightedValue[0] * weightedValue[1] / totalWeight;
    }, 0);
}

async function processGame(game) {

    let timeBuckets = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]
    let participants = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    let result = {}
    result['total'] = {}
    timeBuckets.forEach(time => {
        result[time] = {}
        participants.forEach(p => {
            result[time][p] = {total: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            result['total'][p] = {total: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        })
    })

    for(const frame of game.frames) {
        for(const event of frame.events) {
            if(event.type !== 'CHAMPION_KILL') continue

            // console.log(event)
            const timeBucket = parseInt(event.timestamp / FIVE_MINUTES) * 5;
            const killer = event.killerId
            const involvedCount = event.assistingParticipantIds.length + 1;

            // Process the killer
            result[timeBucket][event.killerId][involvedCount] += 1
            // result[timeBucket][event.killerId]['total'] += 1
            result['total'][event.killerId][involvedCount] += 1
            // result['total'][event.killerId]['total'] += 1

            // Additionally process those involved in the fight.
            for(const player of event.assistingParticipantIds) {
                result[timeBucket][player][involvedCount] += 1
                // result[timeBucket][player]['total'] += 1
                result['total'][player][involvedCount] += 1
                // result['total'][player]['total'] += 1
            }
        }
    }

    let finalResult = {}

    // final processing
    for (const key in result.total) {
        const plr = result.total[key]
        let scale = 100 / plr.total;
        let weight = (plr.total / 2) + (plr[4]/2 + plr[5]) - (plr[1] + plr[2]/2)
        let pos =  scale * weight;
        finalResult[key] = precisionRound(weightedMean([
                    [1, plr[1]],
                    [2, plr[2]],
                    [3, plr[3]],
                    [4, plr[4]],
                    [5, plr[5]],
                ]) * 20, 2)
        // console.log(plr);
        // console.log(pos);
    }
    return finalResult
}

async function getGame(region, gameId) {
    let result = await api.request(region, 'match', `/lol/match/v3/matches/${gameId}`)
    return result
}

async function getLastGames(region, account) {
    let result = await api.request(region, 'match', `/lol/match/v3/matchlists/by-account/${account}/recent`);
    return result

}

async function getTimelime(region, match) {
    let result = await api.request(region, 'match', `/lol/match/v3/timelines/by-match/${match}`);
    return result;
}

function compose(timeline, lastGame) {
    let people = {}
    lastGame.participantIdentities.forEach(p => {
        people[p.participantId] ={ id: p.player.currentAccountId, name: p.player.summonerName}
    });
    let results = {}
    for(let k in timeline) {
        results[people[k].id] = {score: timeline[k], summoner: people[k].name}
    }
    return results
}

async function calculate(region, account) {

    let lastGames = await getLastGames(region, account);
    for(var gameKey in lastGames.matches) {
        let lastGame = await getGame(region, lastGames.matches[gameKey].gameId)
        if (lastGame.queueId === 850) continue
        let gameTimelime = await getTimelime(region, lastGame.gameId);
        let timeline = await processGame(gameTimelime);
        let result = compose(timeline, lastGame);
        console.log(result)
    }
    // let lastGame = await getGame(region, lastGames.matches[0].gameId)
    // let gameTimelime = await getTimelime(region, lastGame.gameId);
    // let timeline = await processGame(gameTimelime);
    // let result = compose(timeline, lastGame);
    // console.log(result)
}

calculate('euw1', '28758041')