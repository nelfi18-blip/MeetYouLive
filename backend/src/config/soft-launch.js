"use strict";

const VIP_SOFT_LAUNCH_MESSAGE = "VIP is coming soon. During soft launch, the primary monetization is Coins, gifts, exclusive content, private video calls, and creator withdrawals.";

const isVipCheckoutEnabled = () => process.env.ENABLE_VIP_CHECKOUT === "true";

module.exports = { VIP_SOFT_LAUNCH_MESSAGE, isVipCheckoutEnabled };
