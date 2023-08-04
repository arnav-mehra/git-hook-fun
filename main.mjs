import mysql from 'mysql';

// MYSQL CONNECTION

const con = mysql.createConnection({
  host: process.env.DB_ENDPOINT,
  port: 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DB
});

con.connect(err => {
  if (err) console.log(err);
});

// EVENT/REQUEST HANDLER

const logData = (data) => {
  let { name, loc, commit, repo } = data;
  
  if (!Array.isArray(loc) || isNaN(loc[0]) || isNaN(loc[1])) {
    loc = [ null, null ];
  }

  const usernameRegex = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
  if (!usernameRegex.test(name)) {
    throw new Error("invalid gh name");
  }
  
  const commitRegex = /\b([a-f0-9]{40})\b/;
  if (!commitRegex.test(commit)) {
    commit = null;
  }
  
  const repoRegex = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/;
  if (!repoRegex.test(repo)) {
    repo = null;
  }

  return new Promise((res, rej) => {
    con.query(
      `
        INSERT INTO GitLog (username, commit, repo, lat, lon)
        VALUES ('${name}', '${commit}', '${repo}', ${loc[0]}, ${loc[1]});
      `,
      (err, result) => {
        if (err) rej(err);
        res(result);
      }
    );
  });
};

const getData = () => {
  return new Promise((res, rej) => {
    con.query(
      `
        SELECT *
        FROM GitLog
        WHERE timestamp > DATE_SUB(now(), INTERVAL 1 DAY)
        ORDER BY timestamp DESC
      `,
      (err, result, field) => {
        if (err) rej(err);
        res(result);
      }
    );
  });
};

const getLeaderboard = () => {
  const time = Date.now();
  const lastDay = time - (24 * 60 * 60 * 1000); 
  
  return new Promise((res, rej) => {
    con.query(
      `
        SELECT * FROM (
          SELECT
            gl.username,
            gl.commit,
            gl.lon,
            gl.lat,
            COUNT(*) as num_recent_commits,
            MAX(gl.timestamp) as most_recent_commit_timestamp
          FROM (
            SELECT *
            FROM GitLog gl2
            WHERE gl2.timestamp > DATE_SUB(now(), INTERVAL 1 DAY)
          ) gl
          GROUP BY gl.username
        ) gl3
        ORDER BY
          gl3.num_recent_commits DESC,
          gl3.most_recent_commit_timestamp DESC;
      `,
      (err, result, field) => {
        if (err) rej(err);
        res(result);
      }
    );
  });
};

const handleRequest = (req) => {
  const sig = req.method + ' ' + req.path;
  switch (sig) {
    case "POST /":           return logData(req.body);
    case "GET /":            return getData();
    case "GET /leaderboard": return getLeaderboard();
  }
  throw new Error("no such method-route exists");
};

export const handler = async (event) => {
  try {
    const req = {
      method: event.requestContext.http.method,
      path: event.requestContext.http.path,
      body: event.body ? JSON.parse(event.body) : {}
    };

    const data = await handleRequest(req);

    return {
      statusCode: 200,
      body: JSON.stringify(data),
    };
  }
  catch (err) {
    console.log(err);
    return {
      statusCode: 400,
      body: { err }
    };
  }
};

// TESTING

handler({
  "httpMethod": "GET",
  "path": "/",
  "body": JSON.stringify({
    "username": "ArnavMeh",
    "commit": null,
    "repo": null,
    "lon": 30,
    "lat": -70
  })
}).then(console.log)