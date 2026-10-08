import type { SkillCase } from "../../src/index.js";

// "quality" cases run with no tools (skillTask measures SKILL.md content in isolation), so each
// prompt inlines the code under review. The practices below come straight from the skill's rules
// (A01/A04/A07/A08/A09, the "Do NOT flag" list and the Golden rule).

const VULNERABLE_ROUTES = `Here is the code to review — treat it as already collected, produce the review directly (do not ask for tool access).

// routes/posts.js (Express + Mongoose)
const router = express.Router();

router.post('/posts', async (req, res) => {
  const post = await Post.create(req.body);          // body comes from the client
  res.json(post);
});

router.delete('/posts/:id', auth, async (req, res) => {
  await Post.findByIdAndDelete(req.params.id);       // any authenticated user can delete any post
  res.sendStatus(204);
});

// middleware/auth.js
module.exports = function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    req.user = jwt.decode(token);                     // token comes from the request header
    next();
  } catch (e) {
    res.status(401).json({ error: 'bad token' });
  }
};`;

const SAFE_CODE = `Here is the code to review — treat it as already collected, produce the review directly (do not ask for tool access).

// server/jobs/sync.js
const upstream = process.env.API_URL;                 // set by ops at deploy time, not user-controlled
export async function sync() {
  const res = await fetch(upstream + '/items');
  return res.json();
}

// client/Comment.jsx
export function Comment({ comment }) {
  return <p className="comment">{comment.body}</p>;   // comment.body is user text, rendered as a JSX child
}

// server/test/auth.test.js
const TEST_PASSWORD = 'hunter2-test-only';             // fixture used only by the unit tests`;

const LEAKY_CODE = `Here is the code to review — treat it as already collected, produce the review directly (do not ask for tool access).

// config.js
export const config = {
  mongoUri: 'mongodb+srv://admin:Sup3rS3cret@cluster0.example.mongodb.net/blog',
  awsKey: 'AKIAIOSFODNN7EXAMPLE',
};

// routes/auth.js
router.post('/login', async (req, res) => {
  console.log('login attempt', req.body);             // body contains { email, password }
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(401).json({ error: 'No such user' });
  if (!(await bcrypt.compare(req.body.password, user.password))) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  res.json({ token: jwt.sign({ userId: user.id }, 'secret') });
});`;

export const cases: SkillCase[] = [
  {
    name: "flags jwt.decode, mass assignment and missing ownership check with a concrete fix",
    kind: "quality",
    prompt: `Security-review this Express code before we merge it.\n\n${VULNERABLE_ROUTES}`,
    grounding: ["jwt.verify"],
    practices: [
      "the review flags that the auth middleware uses jwt.decode(), which does not verify the token signature, and recommends jwt.verify() instead",
      "the review flags Post.create(req.body) as mass assignment and recommends destructuring only the expected fields from req.body",
      "the review flags that DELETE /posts/:id performs no ownership check (being authenticated does not mean authorized for that post) and recommends comparing the post's author to the current user",
      "each reported issue names the file or route and gives a specific fix, not generic advice like 'improve security'",
      "the review assigns each issue an explicit severity (CRITICAL, HIGH, MEDIUM or LOW)",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
  {
    name: "judges server-controlled values, framework-escaped output and test fixtures as safe",
    kind: "quality",
    // The prompt demands one explicit verdict per block: a "did not report X" practice has no
    // quotable evidence, so a terse model answer would fail the judge for the wrong reason.
    prompt: `Security-review this code. For EACH of the three blocks write one line: the block name, a verdict (SAFE or VULNERABLE) and the reason. Only call something VULNERABLE if an attacker can really exploit it.\n\n${SAFE_CODE}`,
    practices: [
      "gives the fetch(upstream) block in sync.js a SAFE verdict (or states it is not exploitable) and gives as the reason that API_URL comes from process.env / is server-controlled, not attacker-controlled",
      "gives the Comment.jsx block a SAFE verdict (or states it is not exploitable) and gives as the reason that React escapes JSX children",
      "gives the test-file block a SAFE verdict (or states it is out of scope) and gives as the reason that it is a test fixture / test-only value",
      "does not label any of the three blocks VULNERABLE",
    ],
    threshold: 0.75,
    maxTurns: 6,
  },
  {
    name: "detects hardcoded secrets, password logging and user enumeration",
    kind: "quality",
    prompt: `Security-review this code and list what must be fixed before release.\n\n${LEAKY_CODE}`,
    practices: [
      "the review flags the hardcoded MongoDB connection string with credentials and the hardcoded AWS access key (AKIA...) as secrets that must move to environment variables",
      "the review flags console.log of req.body in the login route because it writes the user's password to the logs",
      "the review flags that the login route returns different errors for an unknown email ('No such user') and a wrong password ('Wrong password'), which enables user enumeration, and recommends one generic 'Invalid credentials' message",
      "the review flags the weak hardcoded JWT secret 'secret' and recommends a random secret of at least 32 bytes loaded from an environment variable",
      "the hardcoded secrets are rated CRITICAL or HIGH, not LOW",
    ],
    threshold: 0.7,
    maxTurns: 6,
  },
];
