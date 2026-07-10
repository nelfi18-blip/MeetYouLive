const currentUserId = "507f1f77bcf86cd799439011";
const otherUserId = "507f1f77bcf86cd799439012";

const makeReq = (query = {}) => ({
  userId: currentUserId,
  query,
  protocol: "https",
  get(name) {
    return name.toLowerCase() === "host" ? "meetyoulive.onrender.com" : "";
  },
});

const makeRes = () => {
  const res = {
    set: jest.fn(),
    status: jest.fn(() => res),
    json: jest.fn(),
  };
  return res;
};

const makeQueryChain = (value) => {
  const chain = {};
  chain.select = jest.fn(() => chain);
  chain.sort = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.populate = jest.fn(() => chain);
  chain.lean = jest.fn(() => chain);
  chain.cursor = jest.fn(() => value);
  chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  chain.catch = (reject) => Promise.resolve(value).catch(reject);
  return chain;
};

const setupController = () => {
  jest.resetModules();

  const User = {
    findById: jest.fn(),
    find: jest.fn(),
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(() => Promise.resolve({})),
  };
  const Live = {
    find: jest.fn(),
  };
  const Like = {
    distinct: jest.fn(),
  };

  jest.doMock("../../models/User.js", () => User);
  jest.doMock("../../models/Live.js", () => Live);
  jest.doMock("../../models/Like.js", () => Like);
  jest.doMock("../../models/UserVisit.js", () => ({}));
  jest.doMock("../../models/Greeting.js", () => ({}));
  jest.doMock("../../models/Gift.js", () => ({}));
  jest.doMock("../../services/live.service.js", () => ({
    filterActiveLives: jest.fn(() => []),
    isLiveActuallyActive: jest.fn(() => false),
  }));
  jest.doMock("../../lib/socket.js", () => ({
    hasLiveHost: jest.fn(() => false),
  }));

  const { getFeed } = require("../feed.controller.js");
  return { getFeed, User, Live, Like };
};

const currentUser = {
  _id: currentUserId,
  name: "Current User",
  role: "user",
  isBlocked: false,
  isSuspended: false,
  onboardingComplete: true,
  birthdate: new Date("1998-01-01T00:00:00.000Z"),
  gender: "male",
  interestedIn: "both",
  location: { country: "Chile", city: "Santiago" },
  interests: ["music", "travel", "movies"],
  intent: "dating",
  avatar: "https://example.com/current.jpg",
  profilePhotos: ["https://example.com/current.jpg"],
  images: [{ url: "https://example.com/current.jpg", isPrimary: true }],
};

describe("getFeed", () => {
  let consoleLogSpy;
  let consoleDebugSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.dontMock("../../models/User.js");
    jest.dontMock("../../models/Live.js");
    jest.dontMock("../../models/Like.js");
  });

  test("returns strict feedMode when strict feed has candidates", async () => {
    const { getFeed, User, Live, Like } = setupController();
    const strictProfile = {
      _id: otherUserId,
      name: "Strict Candidate",
      username: "strict_candidate",
      avatar: "https://example.com/strict.jpg",
      profilePhotos: ["https://example.com/strict.jpg"],
      images: [{ url: "https://example.com/strict.jpg", isPrimary: true }],
    };

    User.findById.mockReturnValue(makeQueryChain(currentUser));
    User.aggregate.mockResolvedValue([strictProfile]);
    User.countDocuments.mockResolvedValue(0);
    User.find.mockReturnValue(makeQueryChain([]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([]);

    const res = makeRes();
    await getFeed(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feedMode: "strict",
        debug: expect.objectContaining({
          matchedProfiles: 1,
          fallbackUsed: false,
        }),
        profiles: [expect.objectContaining({ _id: otherUserId })],
        recommendedProfiles: [expect.objectContaining({ _id: otherUserId })],
      })
    );
    expect(User.find).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      "men",
      { ...currentUser, gender: "female", interestedIn: "men" },
      { $in: ["male", "man"] },
      { $in: ["", null, "women", "female", "both"] },
    ],
    [
      "women",
      { ...currentUser, gender: "male", interestedIn: "women" },
      { $in: ["female", "woman"] },
      { $in: ["", null, "men", "male", "both"] },
    ],
    [
      "both",
      { ...currentUser, gender: "male", interestedIn: "both" },
      { $in: ["female", "male", "woman", "man"] },
      { $in: ["", null, "men", "male", "both"] },
    ],
  ])("strict feed applies %s discovery gender preferences", async (preferenceType, viewer, expectedGender, expectedInterestedIn) => {
    const { getFeed, User, Live, Like } = setupController();
    const strictProfile = {
      _id: otherUserId,
      name: "Strict Candidate",
      username: `${preferenceType}_candidate`,
      gender: expectedGender.$in[0],
      interestedIn: "both",
      avatar: "https://example.com/strict.jpg",
      profilePhotos: ["https://example.com/strict.jpg"],
      images: [{ url: "https://example.com/strict.jpg", isPrimary: true }],
    };

    User.findById.mockReturnValue(makeQueryChain(viewer));
    User.aggregate.mockResolvedValue([strictProfile]);
    User.countDocuments.mockResolvedValue(0);
    User.find.mockReturnValue(makeQueryChain([]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([]);

    const res = makeRes();
    await getFeed(makeReq(), res);

    const strictMatch = User.aggregate.mock.calls[0][0][0].$match;
    expect(strictMatch.gender).toEqual(expectedGender);
    expect(strictMatch.interestedIn).toEqual(expectedInterestedIn);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        feedMode: "strict",
        profiles: [
          expect.objectContaining({
            _id: otherUserId,
          }),
        ],
      })
    );
  });

  test("ignoreExclude ignores client and liked exclusions but keeps self excluded", async () => {
    const { getFeed, User, Live, Like } = setupController();
    const strictProfile = {
      _id: otherUserId,
      name: "Strict Candidate",
      username: "strict_candidate",
      avatar: "https://example.com/strict.jpg",
      profilePhotos: ["https://example.com/strict.jpg"],
      images: [{ url: "https://example.com/strict.jpg", isPrimary: true }],
    };

    User.findById.mockReturnValue(makeQueryChain(currentUser));
    User.aggregate.mockResolvedValue([strictProfile]);
    User.countDocuments.mockResolvedValue(0);
    User.find.mockReturnValue(makeQueryChain([]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([otherUserId]);

    const res = makeRes();
    await getFeed(makeReq({ exclude: otherUserId, ignoreExclude: "true" }), res);

    const strictMatch = User.aggregate.mock.calls[0][0][0].$match;
    expect(strictMatch._id.$nin.map(String)).toEqual([currentUserId]);
    expect(Like.distinct).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feedMode: "strict",
        debug: expect.objectContaining({ ignoreExclude: true }),
        profiles: [expect.objectContaining({ _id: otherUserId })],
        recommendedProfiles: [expect.objectContaining({ _id: otherUserId })],
      })
    );
  });

  test("returns betaFallback feedMode when strict feed has no candidates", async () => {
    const { getFeed, User, Live, Like } = setupController();
    const fallbackProfile = {
      _id: otherUserId,
      name: "Fallback Candidate",
      username: "fallback_candidate",
      role: "User",
      isBlocked: false,
      isSuspended: false,
      avatar: "/uploads/fallback.jpg",
    };

    User.findById.mockReturnValue(makeQueryChain(currentUser));
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);
    User.find
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([fallbackProfile]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([]);

    const res = makeRes();
    await getFeed(makeReq({ limit: "10" }), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feedMode: "betaFallback",
        reason: "No hubo candidatos con filtros estrictos. Mostrando usuarios de prueba en modo Beta.",
        debug: expect.objectContaining({ strictCount: 0, fallbackCount: 1 }),
        profiles: [expect.objectContaining({ _id: otherUserId })],
        recommendedProfiles: [expect.objectContaining({ _id: otherUserId })],
      })
    );
    expect(User.find.mock.calls[2][0]).toEqual(
      expect.objectContaining({
        _id: { $nin: [expect.any(Object)] },
        role: { $in: ["user", "User"] },
        isBlocked: { $ne: true },
        isSuspended: { $ne: true },
      })
    );
  });

  test("betaFallback keeps gender and reciprocal interestedIn preferences", async () => {
    const { getFeed, User, Live, Like } = setupController();
    const viewerSeekingMen = {
      ...currentUser,
      gender: "female",
      interestedIn: "men",
    };
    const fallbackProfile = {
      _id: otherUserId,
      name: "Fallback Candidate",
      username: "fallback_candidate",
      role: "User",
      gender: "male",
      interestedIn: "women",
      isBlocked: false,
      isSuspended: false,
      avatar: "/uploads/fallback.jpg",
    };

    User.findById.mockReturnValue(makeQueryChain(viewerSeekingMen));
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);
    User.find
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([fallbackProfile]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([]);

    const res = makeRes();
    await getFeed(makeReq({ limit: "10" }), res);

    const fallbackMatch = User.find.mock.calls[2][0];
    expect(fallbackMatch.gender).toEqual({ $in: ["male", "man"] });
    expect(fallbackMatch.interestedIn).toEqual({ $in: ["", null, "women", "female", "both"] });
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        feedMode: "betaFallback",
        debug: expect.objectContaining({
          feedMode: "betaFallback",
          matchedProfiles: 1,
          fallbackUsed: true,
          filtersApplied: expect.objectContaining({
            gender: true,
            reciprocalInterestedIn: true,
          }),
          genderPreference: expect.objectContaining({
            interestedIn: "men",
            viewerGender: "female",
            candidateGenderFilter: { $in: ["male", "man"] },
          }),
        }),
        profiles: [expect.objectContaining({ _id: otherUserId })],
      })
    );
  });

  test("ignoreExclude also ignores client and liked exclusions in betaFallback", async () => {
    const { getFeed, User, Live, Like } = setupController();
    const fallbackProfile = {
      _id: otherUserId,
      name: "Fallback Candidate",
      username: "fallback_candidate",
      role: "User",
      isBlocked: false,
      isSuspended: false,
      avatar: "/uploads/fallback.jpg",
    };

    User.findById.mockReturnValue(makeQueryChain(currentUser));
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);
    User.find
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([fallbackProfile]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([otherUserId]);

    const res = makeRes();
    await getFeed(makeReq({ exclude: otherUserId, ignoreExclude: "true" }), res);

    const strictMatch = User.aggregate.mock.calls[0][0][0].$match;
    const fallbackMatch = User.find.mock.calls[2][0];
    expect(strictMatch._id.$nin.map(String)).toEqual([currentUserId]);
    expect(fallbackMatch._id.$nin.map(String)).toEqual([currentUserId]);
    expect(Like.distinct).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        feedMode: "betaFallback",
        debug: expect.objectContaining({ ignoreExclude: true, fallbackCount: 1 }),
        profiles: [expect.objectContaining({ _id: otherUserId })],
        recommendedProfiles: [expect.objectContaining({ _id: otherUserId })],
      })
    );
  });

  test("fallback excludes the current user and blocked or suspended users in its query", async () => {
    const { getFeed, User, Live, Like } = setupController();

    User.findById.mockReturnValue(makeQueryChain(currentUser));
    User.aggregate.mockResolvedValue([]);
    User.countDocuments.mockResolvedValue(0);
    User.find
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]))
      .mockReturnValueOnce(makeQueryChain([]));
    Live.find.mockReturnValue(makeQueryChain([]));
    Like.distinct.mockResolvedValue([]);

    const res = makeRes();
    await getFeed(makeReq(), res);

    const fallbackMatch = User.find.mock.calls[2][0];
    expect(fallbackMatch._id.$nin.map(String)).toEqual([currentUserId]);
    expect(fallbackMatch.isBlocked).toEqual({ $ne: true });
    expect(fallbackMatch.isSuspended).toEqual({ $ne: true });
  });
});
