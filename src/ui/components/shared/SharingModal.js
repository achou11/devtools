import React, { useEffect, useState } from "react";
import { connect } from "react-redux";
import { gql, useQuery, useMutation } from "@apollo/client";
import { selectors } from "ui/reducers";
import { actions } from "ui/actions";
import Modal from "ui/components/shared/Modal";
import "./SharingModal.css";

const GET_OWNER_AND_COLLABORATORS = gql`
  query GetOwnerAndCollaborators($recordingId: uuid!) {
    collaborators(where: { recording_id: { _eq: $recordingId } }) {
      user {
        email
        id
        name
        nickname
        picture
      }
      user_id
      recording_id
    }
    recordings_by_pk(id: $recordingId) {
      user {
        email
        id
        name
        nickname
        picture
      }
      id
      is_private
    }
  }
`;

const ADD_COLLABORATOR = gql`
  mutation AddCollaborator($objects: [collaborators_insert_input!]! = {}) {
    insert_collaborators(objects: $objects) {
      affected_rows
    }
  }
`;

const DELETE_COLLABORATOR = gql`
  mutation DeleteCollaborator($recordingId: uuid, $userId: uuid) {
    delete_collaborators(
      where: { _and: { recording_id: { _eq: $recordingId } }, user_id: { _eq: $userId } }
    ) {
      affected_rows
    }
  }
`;

function useFetchCollaborateorId(email) {
  const { data, loading, error } = useQuery(
    gql`
      query GetCollaboratorId($email: String = "") {
        user_id_by_email(args: { email: $email }) {
          id
        }
      }
    `,
    {
      variables: { email },
    }
  );

  const userId = data?.user_id_by_email[0]?.id;

  return { userId, loading, error };
}

function Permission({ user, role, recordingId }) {
  const [deleteCollaborator, { error }] = useMutation(DELETE_COLLABORATOR, {
    refetchQueries: ["GetOwnerAndCollaborators"],
  });
  const handleDeleteClick = () => {
    deleteCollaborator({ variables: { recordingId, userId: user.id } });
  };
  const [showErrorMessage, setShowErrorMessage] = useState(false);

  if (error) {
    setTimeout(() => setShowErrorMessage(false), 2000);
    return <div className="permission">Could not delete this collaborator</div>;
  }

  return (
    <div className="permission">
      <div className="icon" style={{ backgroundImage: `url(${user.picture})` }} />
      <div className="main">
        <div className="name">{user.name}</div>
        <div className="email">{user.email}</div>
      </div>
      <div className="role">{role}</div>
      {role === "collaborator" ? (
        <button className="delete" onClick={handleDeleteClick}>
          <div className="img close" />
        </button>
      ) : null}
    </div>
  );
}

function PermissionsList({ recording, collaborators, recordingId }) {
  const owner = recording.user;

  return (
    <div className="permissions-list">
      <Permission user={owner} role={"owner"} />
      {collaborators
        ? collaborators.map((collaborator, i) => (
            <Permission
              user={collaborator.user}
              role={"collaborator"}
              key={i}
              recordingId={recordingId}
            />
          ))
        : null}
    </div>
  );
}

function Fetcher({ setStatus, email }) {
  const { userId, loading, error } = useFetchCollaborateorId(email);

  useEffect(() => {
    if (!loading) {
      setStatus({ type: "fetched-user", userId, error });
    }
  });

  return <div className="row status">{loading ? "Fetching" : "Fetched"}</div>;
}

function Submitter({ setStatus, userId, recordingId }) {
  const [addNewCollaborator, { loading, error }] = useMutation(ADD_COLLABORATOR, {
    refetchQueries: ["GetOwnerAndCollaborators"],
  });

  useEffect(() => {
    addNewCollaborator({
      variables: { objects: [{ recording_id: recordingId, user_id: userId }] },
    });
  }, []);

  useEffect(() => {
    if (!loading) {
      setStatus({ type: "submitted-user", error });
    }
  });

  return <div className="row status">{loading ? "Submitting" : "Submitted"}</div>;
}

function EmailForm({ recordingId }) {
  const [inputValue, setInputValue] = useState("");
  const [status, setStatus] = useState({ type: "input" });

  const handleSubmit = e => {
    e.preventDefault();
    setStatus({ type: "submitted-email" });
  };
  const ErrorHandler = ({ message }) => {
    setTimeout(() => {
      setStatus({ type: "input" });
      setInputValue("");
    }, 2000);

    return <div className="row status error">{message}</div>;
  };

  // The status.type progresses as follows:
  // (start) input -> submitted-email -> fetched-user -> submitted-user -> input (end)
  if (status.type === "submitted-email") {
    return <Fetcher setStatus={setStatus} email={inputValue} />;
  }

  if (status.type === "fetched-user") {
    if (status.error) {
      return <ErrorHandler message={"We can not fetch that collaborator right now."} />;
    } else if (!status.userId) {
      return <ErrorHandler message={"That e-mail address is not a valid Replay user."} />;
    }

    return <Submitter setStatus={setStatus} userId={status.userId} recordingId={recordingId} />;
  }

  if (status.type === "submitted-user") {
    if (status.error) {
      return <ErrorHandler message={"We can not add that collaborator right now."} />;
    }

    setStatus({ type: "input" });
    setInputValue("");
  }

  return (
    <form className="row">
      <input
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        placeholder="Add a collaborator"
      />
      <input type="submit" onClick={handleSubmit} value={"Add"} />
    </form>
  );
}

function Sharing({ hideModal, modalOptions }) {
  const { recordingId } = modalOptions;
  const { data, loading, error } = useQuery(GET_OWNER_AND_COLLABORATORS, {
    variables: { recordingId },
  });

  if (loading) {
    return <Modal />;
  } else if (error || !data.recordings_by_pk) {
    setTimeout(() => hideModal(), 2000);
    return (
      <Modal>
        <div className="row status">Can&apos;t fetch your sharing permissions at this time</div>
      </Modal>
    );
  }

  const { collaborators, recordings_by_pk: recording } = data;
  return (
    <Modal>
      <div className="row title">
        <div className="img invite" />
        <p>Add collaborators</p>
      </div>
      <EmailForm recordingId={recordingId} />
      <PermissionsList
        recording={recording}
        collaborators={collaborators}
        recordingId={recordingId}
      />
      <div className="bottom">
        <div className="spacer" />
        <button className="done" onClick={hideModal}>
          <div className="content">Done</div>
        </button>
      </div>
    </Modal>
  );
}

export default connect(
  state => ({
    modal: selectors.getModal(state),
    modalOptions: selectors.getModalOptions(state),
  }),
  { hideModal: actions.hideModal }
)(Sharing);
