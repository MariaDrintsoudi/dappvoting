import React, { Component } from 'react';
import 'bootstrap/dist/css/bootstrap.css';
import web3 from './web3';
import voting from './voting';

class App extends Component {
  state = {
    manager: '',
    secondaryManager: '0x153dfef4355E823dCB0FCc76Efe942BefCa86477',
    proposals: [],
    votes: {},
    value: '',
    message: '',
    currentAccount: '',
    contractBalance: '',
    votingEnded: false,
    winningProposal: '',
    remainingVotes: 5,
    voteHistory: [],
    newOwner: '',
    contractDestroyed: false,
  };

  proposalImages = [
    '/sam.png',
    '/mark.png',
    '/elon.png'
  ];

  async componentDidMount() {
    if (!window.ethereum) {
      this.setState({ message: 'Metamask is not installed' });
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const currentAccount = accounts[0].toLowerCase();
      this.setState({ currentAccount });

      await this.fetchData(currentAccount);

      this.setupEventListeners();
    } catch (error) {
      if (error.code === 4001) {
        this.setState({ message: 'User rejected the connection request' });
      } else {
        this.setState({ message: 'Could not connect to MetaMask' });
      }
    }
  }

  fetchData = async (currentAccount) => {
    const manager = (await voting.methods.manager().call()).toLowerCase();
    const proposals = await voting.methods.getProposals().call();
    const votes = {};
    for (let proposal of proposals) {
      votes[proposal] = parseInt(await voting.methods.getVotes(proposal).call());
    }
    const votingEnded = await voting.methods.votingEnded().call();
    const winningProposal = votingEnded ? await voting.methods.winningProposal().call() : '';
    const remainingVotes = parseInt(await voting.methods.getRemainingVotes(currentAccount).call());
    const contractBalance = await web3.eth.getBalance(voting.options.address);
    const voteHistory = await voting.methods.getVoteHistory().call();
    const contractDestroyed = await voting.methods.contractDestroyed().call();

    console.log('Fetched data:', { manager, proposals, votes, votingEnded, winningProposal, contractBalance, remainingVotes, voteHistory, contractDestroyed });

    this.setState({ manager, proposals, votes, votingEnded, winningProposal, contractBalance, remainingVotes, voteHistory, contractDestroyed });
  }

  setupEventListeners() {
    window.ethereum.on('accountsChanged', async (accounts) => {
      const currentAccount = accounts[0].toLowerCase();
      console.log('Account changed:', currentAccount);
      this.setState({ currentAccount });
      await this.fetchData(currentAccount);
    });

    voting.events.VoteCast()
      .on('data', async (event) => {
        const { voter, proposal, votes } = event.returnValues;
        console.log('VoteCast event:', { proposal, votes });

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
        this.setState({ message: `Account ${voter} gave ${votes} votes to ${proposal}` });
      })
      .on('error', console.error);

    voting.events.VotingEnded()
      .on('data', async (event) => {
        const { winningProposal } = event.returnValues;
        console.log('VotingEnded event:', { winningProposal });

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
        this.setState({ message: `Voting ended! Winning proposal: ${winningProposal}` });
        alert(`Voting ended! Winning proposal: ${winningProposal}`);
      })
      .on('error', console.error);

    voting.events.VotingReset()
      .on('data', async () => {
        console.log('VotingReset event');

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      })
      .on('error', console.error);

    voting.events.WinnerDeclared()
      .on('data', async (event) => {
        const { winningProposal, votes } = event.returnValues;
        console.log('WinnerDeclared event:', { winningProposal, votes });

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
        alert(`The winner is ${winningProposal} with ${votes} votes`);
      })
      .on('error', console.error);

    voting.events.OwnerChanged()
      .on('data', async (event) => {
        const { oldOwner, newOwner } = event.returnValues;
        console.log('OwnerChanged event:', { oldOwner, newOwner });

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
        alert(`The ownership has been transferred from ${oldOwner} to ${newOwner}`);
      })
      .on('error', console.error);

    voting.events.ContractDestroyed()
      .on('data', async () => {
        console.log('ContractDestroyed event');

        await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
        alert('The contract has been destroyed');
      })
      .on('error', console.error);

    setInterval(async () => {
      this.updateContractBalance();
    }, 10000); // Update every 10 seconds
  }

  updateRemainingVotes = async () => {
    const remainingVotes = parseInt(await voting.methods.getRemainingVotes(this.state.currentAccount).call());
    this.setState({ remainingVotes });
  }

  updateContractBalance = async () => {
    const contractBalance = await web3.eth.getBalance(voting.options.address);
    this.setState({ contractBalance });
  }

  onVote = async (proposal, votes) => {
    if (this.state.remainingVotes < votes) {
      this.setState({ message: `You have only ${this.state.remainingVotes} votes left.` });
      return;
    }

    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.vote(proposal, votes).send({
        from: this.state.currentAccount,
        value: web3.utils.toWei((votes * 0.01).toString(), 'ether')
      });

      console.log('Vote transaction successful');
      
      await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      this.setState({ message: `Account ${this.state.currentAccount} gave ${votes} votes to ${proposal}` });
    } catch (error) {
      console.log('Vote transaction failed:', error);
      this.setState({ message: 'Transaction failed!' });
    }
  };

  onEndVoting = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.endVoting().send({ from: this.state.currentAccount });

      console.log('End voting transaction successful');

      await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      this.setState({ message: 'Voting ended successfully!' });
    } catch (error) {
      console.log('End voting transaction failed:', error);
      this.setState({ message: 'Transaction failed!' });
    }
  };

  onWithdraw = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.withdraw().send({ from: this.state.currentAccount });

      console.log('Withdraw transaction successful');

      this.updateContractBalance();
      this.setState({ message: 'Withdrawal successful!' });
    } catch (error) {
      console.log('Withdraw transaction failed:', error);
      this.setState({ message: 'Withdrawal failed!' });
    }
  };

  onResetVoting = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.resetVoting().send({ from: this.state.currentAccount });

      console.log('Reset voting transaction successful');

      await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      this.setState({ message: 'Voting reset successfully!' });
    } catch (error) {
      console.log('Reset voting transaction failed:', error);
      this.setState({ message: 'Reset voting failed!' });
    }
  };

  onShowHistory = () => {
    const historyMessage = this.state.voteHistory
      .map(history => `Vote #${history.id}: ${history.proposal} with ${history.votes} votes`)
      .join('\n');

    alert(historyMessage || 'No voting history available.');
  };

  onChangeOwner = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.changeOwner(this.state.newOwner).send({ from: this.state.currentAccount });

      console.log('Change owner transaction successful');

      await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      this.setState({ message: `Ownership transferred to ${this.state.newOwner}` });
    } catch (error) {
      console.log('Change owner transaction failed:', error);
      this.setState({ message: 'Transaction failed!' });
    }
  };

  onDestroyContract = async () => {
    this.setState({ message: 'Waiting on transaction success...' });

    try {
      await voting.methods.destroyContract().send({ from: this.state.currentAccount });

      console.log('Destroy contract transaction successful');

      await this.fetchData(this.state.currentAccount); // Re-fetch data to ensure consistency
      this.setState({ message: 'Contract destroyed successfully!' });
    } catch (error) {
      console.log('Destroy contract transaction failed:', error);
      this.setState({ message: 'Transaction failed!' });
    }
  };

  render() {
    const isManager = this.state.currentAccount === this.state.manager || this.state.currentAccount === this.state.secondaryManager.toLowerCase();
    const { contractDestroyed } = this.state;

    return (
      <div className="container">
        <h2>Voting Contract</h2>
        <p>
          This contract is managed by {this.state.manager} and {this.state.secondaryManager}.
        </p>
        <p>
          The contract balance is {web3.utils.fromWei(this.state.contractBalance, 'ether')} ether.
        </p>
        <p>
          Current Metamask account: {this.state.currentAccount}
        </p>
        <p>
          Remaining votes: {this.state.remainingVotes}
        </p>
        <button className="btn btn-info" onClick={this.onShowHistory}>History</button>
        <hr />

        {contractDestroyed ? (
          <div>
            <h3>The contract has been destroyed. Only history is available.</h3>
          </div>
        ) : (
          <>
            {this.state.votingEnded ? (
              <div>
                <h3 className="winning-proposal">The winning proposal is: {this.state.winningProposal}</h3>
              </div>
            ) : (
              <div>
                <h4>Vote for your preferred proposal:</h4>
                {this.state.proposals.map((proposal, index) => (
                  <div key={index} className="form-group row">
                    <div className="col-md-2">
                      <img src={this.proposalImages[index % this.proposalImages.length]} alt={`Proposal ${index}`} className="img-fluid rounded-circle" />
                    </div>
                    <div className="col-md-8">
                      <label className={proposal === this.state.winningProposal ? "winning-proposal" : ""}>{proposal} (Current votes: {this.state.votes[proposal] || 0})</label>
                      <input
                        type="number"
                        max={this.state.remainingVotes}
                        min="1"
                        className="form-control"
                        placeholder="Number of votes"
                        onChange={event => this.setState({ [proposal]: parseInt(event.target.value, 10) || 1 })}
                      />
                    </div>
                    <div className="col-md-2">
                      <button
                        className="btn btn-primary"
                        onClick={() => this.onVote(proposal, this.state[proposal] || 1)}
                        disabled={this.state.votingEnded || isManager}
                      >
                        Vote
                      </button>
                    </div>
                  </div>
                ))}

                <hr />
                {isManager && (
                  <button
                    className="btn btn-success"
                    onClick={this.onEndVoting}
                    disabled={this.state.votingEnded}
                  >
                    Declare Winner
                  </button>
                )}
              </div>
            )}

            <hr />
            {isManager && (
              <>
                <button className="btn btn-warning" onClick={this.onWithdraw}>
                  Withdraw
                </button>
                <button className="btn btn-secondary" onClick={this.onResetVoting} disabled={!this.state.votingEnded}>
                  Reset Voting
                </button>
                {this.state.votingEnded && (
                  <div className="form-group row">
                    <div className="col-md-10">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="New owner's address"
                        value={this.state.newOwner}
                        onChange={event => this.setState({ newOwner: event.target.value })}
                      />
                    </div>
                    <div className="col-md-2">
                      <button
                        className="btn btn-primary"
                        onClick={this.onChangeOwner}
                      >
                        Change Owner
                      </button>
                    </div>
                  </div>
                )}
                {this.state.votingEnded && (
                  <button
                    className="btn btn-danger"
                    onClick={this.onDestroyContract}
                  >
                    Destroy
                  </button>
                )}
              </>
            )}
          </>
        )}
        <h1>{this.state.message}</h1>
      </div>
    );
  }
}

export default App;
