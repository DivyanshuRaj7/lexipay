// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract LexPayRegistry {
    address public owner;
    uint256 public totalReviews;
    uint256 public totalClausesAnalyzed;
    uint256 public pricePerClauseWei;

    struct ReviewSession {
        address reviewer;
        uint256 clauseCount;
        uint256 criticalCount;
        uint256 highCount;
        uint256 paidAmount;
        uint256 timestamp;
        string documentHash;
    }

    mapping(uint256 => ReviewSession) public sessions;
    mapping(address => uint256[]) public userSessions;

    event ReviewLogged(address indexed reviewer, uint256 indexed sessionId, uint256 clauseCount, uint256 criticalCount);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    modifier onlyOwner() {
        require(msg.sender == owner, "LexPay: caller is not the owner");
        _;
    }

    constructor(uint256 _pricePerClauseWei) {
        owner = msg.sender;
        pricePerClauseWei = _pricePerClauseWei;
    }

    /**
     * @notice Logs a completed contract review session on-chain.
     * @param clauseCount The total number of clauses analyzed.
     * @param criticalCount The number of critical risks identified.
     * @param highCount The number of high risks identified.
     * @param documentHash The keccak256 hash or content identifier of the document.
     */
    function logReview(
        uint256 clauseCount,
        uint256 criticalCount,
        uint256 highCount,
        string calldata documentHash
    ) external payable {
        uint256 requiredPayment = clauseCount * pricePerClauseWei;
        require(msg.value >= requiredPayment, "LexPay: insufficient payment for analysis");

        uint256 sessionId = totalReviews;
        
        sessions[sessionId] = ReviewSession({
            reviewer: msg.sender,
            clauseCount: clauseCount,
            criticalCount: criticalCount,
            highCount: highCount,
            paidAmount: requiredPayment,
            timestamp: block.timestamp,
            documentHash: documentHash
        });

        userSessions[msg.sender].push(sessionId);

        totalReviews++;
        totalClausesAnalyzed += clauseCount;

        emit ReviewLogged(msg.sender, sessionId, clauseCount, criticalCount);

        // Refund any excess payment sent by the user
        if (msg.value > requiredPayment) {
            uint256 excess = msg.value - requiredPayment;
            (bool success, ) = msg.sender.call{value: excess}("");
            require(success, "LexPay: refund failed");
        }
    }

    /**
     * @notice Returns the required payment amount for a given number of clauses.
     * @param clauses The number of clauses to analyze.
     * @return The cost in wei.
     */
    function getQuote(uint256 clauses) external view returns (uint256) {
        return clauses * pricePerClauseWei;
    }

    /**
     * @notice Returns all session IDs that belong to a specific user.
     * @param user The address of the user.
     * @return An array of session IDs.
     */
    function getUserSessions(address user) external view returns (uint256[] memory) {
        return userSessions[user];
    }

    /**
     * @notice Returns global statistics for the registry.
     * @return _totalReviews The total number of documents reviewed.
     * @return _totalClauses The total number of clauses analyzed across all reviews.
     * @return _balance The current ETH/native token balance of the contract.
     */
    function getStats() external view returns (uint256 _totalReviews, uint256 _totalClauses, uint256 _balance) {
        return (totalReviews, totalClausesAnalyzed, address(this).balance);
    }

    /**
     * @notice Updates the required payment amount per clause.
     * @param newPrice The new cost per clause in wei.
     */
    function updatePrice(uint256 newPrice) external onlyOwner {
        emit PriceUpdated(pricePerClauseWei, newPrice);
        pricePerClauseWei = newPrice;
    }

    /**
     * @notice Withdraws the accumulated native token balance to the owner's address.
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "LexPay: no funds to withdraw");
        
        (bool success, ) = owner.call{value: balance}("");
        require(success, "LexPay: withdrawal failed");
    }
}
